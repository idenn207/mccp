'use strict';

// leadtime-observability M1 — 패널 벽시계(`panel_span`) 분포 집계 오라클.
//
// ── 이 도구가 재는 구간 ──────────────────────────────────────────────────────
//
// `panel_span` = `/mccp:plan` Phase 5.2a가 `.claude/state/plan-review/started-at`을
// 찍은 순간부터 `record.js`가 리뷰 레코드를 write한 순간까지. 즉 **한 번의 plan
// 리뷰 게이트 실행이 벽시계로 얼마나 걸렸는가**이고, 그 값은 이미 레코드마다
// `measurement.wall_clock_ms`로 기록돼 있다. 이 도구는 새 계측을 심지 않는다 —
// 있는 값을 읽어 분포로 만들 뿐이다(UI8).
//
// ── 이 도구가 재지 **않는** 구간 ─────────────────────────────────────────────
//
// 이름이 재는 구간을 말한다(PRD 결정 2). 그래서 이 축은 `e2e`가 아니라
// `panel_span`이다.
//
//   패널 종료 → ship        — `post_panel_span`. completion-ledger와
//                             `mccp-pr-codex` receipt를 조인해야 하며 **M2**가 소유한다.
//   `/mccp:work` 진입 → …   — 그 이벤트를 생산하는 것은 **C2**이고 이 축은 소비만 한다(UI5).
//   임계값 · 자동 분기      — **C7**이 소유한다. 이 도구는 분포만 내고 숫자를 정하지 않는다(UI4).
//
// read-only · LLM-free · fs 외 의존 없음. 게이트 경로를 한 줄도 건드리지 않는다(UI7):
// `plan-review/cli.js` 하위 subcommand가 아니라 `evidence-audit.js` 선례대로
// standalone이며 `scripts/lib/` 루트에 산다(DD1) — M2가 조인할 두 소스가 모두
// plan-review 산출물이 아니기 때문이다.
//
// ── 코퍼스의 경계는 `corpus.js`가 소유한다 ───────────────────────────────────
//
// 분모는 `corpus.readReviewRecords` + `corpus.parseRecord`가 정한다(DD2). 리더를
// 복제하면 `REVIEW_SUBDIRS`가 두 곳에 살고, 스캔 경로가 갈라지는 날 두 도구가 서로
// 다른 분모로 같은 커버리지를 주장한다 — 우산 PRD가 지목한 drift 실패 모드 그
// 자체다. 4분류(`out_of_corpus` / `pre_measurement` / `parse_failure` / `record`)의
// 의미는 `corpus.js` 헤더가 정본이다.
//
// ── state precedence ladder (corpus.js 미러) ─────────────────────────────────
//
//   degraded (exit 1) — 디렉토리 read 실패(hard) 또는 parse_failures>0(soft).
//   blind    (exit 2) — **이 축의 관측이 0건**. 측정 가능 레코드가 0건이거나,
//                       레코드는 있는데 `wall_clock_ms` 관측이 전건 결측인 경우
//                       둘 다 여기다. 이때 `panel_span` 키를 **싣지 않는다**.
//   ok       (exit 0) — 관측 ≥1건.
//
// `read_error`가 사다리에 있는 것이 요점이다. 없으면 디렉토리 읽기가 실패해 레코드가
// 덜 잡혔을 때 분모도 함께 줄어 **커버리지가 100%로 접힌다**(fail-open) — 계측
// 고장이 완벽한 측정으로 보이는 최악의 방향이다. `corpus.js:473,670`이 같은 이유로
// `read_error || parse_failures>0 → degraded`를 쓴다.
//
// ── 부재 규칙 3종 ────────────────────────────────────────────────────────────
//
//   (a) 관측 0건이면 `state='blind'`이고 `panel_span` 키 자체를 싣지 않는다.
//       빈 분포를 실으면 소비자가 "관측했더니 0"과 "관측이 없음"을 구분할 수 없다.
//   (b) `wall_clock_ms`가 non-finite면 분포에 넣지 않고 `panel_span_missing_records`에
//       **이름으로** 남긴다 — 0으로 접지 않는다. 0으로 접으면 "즉시 끝난 게이트"라는
//       없는 사실이 생긴다.
//   (c) 관측 0건인 층(verdict/halt_stage)은 `{n:0}`이 아니라 **키 자체를 만들지
//       않는다**. (a)의 층 단위 대우다.
//
// ── 커버리지 없는 값은 출력하지 않는다 (UI3) ─────────────────────────────────
//
// `renderHuman`은 어떤 출력에서도 커버리지 줄을 먼저 낸다. 값만 보이고 분모가 안
// 보이면 하한이 전수로 읽힌다.
//
// ── plan_path는 repo-relative로 정규화해서만 싣는다 ──────────────────────────
//
// `record.js:314`는 호출자가 준 `--plan` 문자열을 **무정규화**로 봉인한다. 그 값이
// 절대경로인 세션이 하나라도 섞이면 사용자 홈·드라이브 문자·머신 고유 worktree 경로가
// 이 도구의 출력에 실리고, M1은 그 출력을 git-tracked 문서에 축자 동결한다. 같은 축을
// 이미 한 번 닫느라 sanctioned 재봉인 도구까지 만든 선례가 있다(CLAUDE.md §3.12 —
// `write.js`가 `meta.cwd`를 repo-relative로 정규화하게 된 이유). 그래서 직렬화 직전에
// `normalizePlanPath`를 통과시키고, repo 밖을 가리키는 경로는 값을 버리고 마커만 남긴다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const corpus = require('./plan-review/corpus');

const STATE_EXIT_CODES = Object.freeze({
  ok: 0,
  degraded: 1,
  blind: 2,
});

function exitCodeForState(state) {
  const code = STATE_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;
}

// halt_stage=null은 "중단하지 않고 완주했다"는 관측이지 결측이 아니다. JSON 객체
// 키는 문자열이라 null을 그대로 쓸 수 없으므로 이름을 준다.
const COMPLETED_KEY = '(completed)';

// repo 밖(또는 정규화 불가)을 가리키는 경로의 대체값. 경로를 그대로 싣는 대신
// 마커를 남긴다 — 커밋되는 산출물에 머신 고유 문자열을 넣지 않는 것이 우선이다.
const NON_REPO_PATH = '(non-repo-relative)';

function warn(msg) {
  process.stderr.write('[mccp:leadtime] ' + msg + '\n');
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

// 절대경로를 repo-relative로 접는다. 이미 상대경로면 구분자만 정규화해 그대로 둔다.
// repo 밖이면 값을 버리고 NON_REPO_PATH를 낸다.
function normalizePlanPath(planPath, repoRoot) {
  if (typeof planPath !== 'string' || planPath === '') return null;
  if (!path.isAbsolute(planPath)) return toPosix(planPath);
  const root = typeof repoRoot === 'string' && repoRoot ? repoRoot : null;
  if (!root) return NON_REPO_PATH;
  const rel = path.relative(root, planPath);
  // '..'로 시작하거나 여전히 절대경로면 repo 밖이다(다른 드라이브 포함).
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return NON_REPO_PATH;
  return toPosix(rel);
}

// nearest-rank. 보간하지 않는 이유는 DD3 — converged 층은 n=5이고, 보간은 없는
// 정밀도를 만든다. 방법 이름을 출력에 함께 실어 소비자가 재계산으로 반증할 수 있게
// 한다.
//
// 경계: n=1이면 어떤 p도 그 유일값이다. n=2면 p50→sorted[0], p90→sorted[1]
// (ceil(0.9*2)=2). 인덱스는 항상 [1, n]으로 clamp되므로 p=0도 최솟값을 낸다.
function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  let rank = Math.ceil((p / 100) * n);
  if (rank < 1) rank = 1;
  if (rank > n) rank = n;
  return sortedAsc[rank - 1];
}

function summarize(valuesAsc) {
  return {
    n: valuesAsc.length,
    min: valuesAsc[0],
    p50: percentile(valuesAsc, 50),
    p90: percentile(valuesAsc, 90),
    max: valuesAsc[valuesAsc.length - 1],
  };
}

// 관측된 항목만 층에 넣으므로 부재 규칙 (c)는 구조적으로 성립한다 — 0건인 층은
// 애초에 키가 만들어지지 않는다.
function stratify(entries, keyFn) {
  const buckets = Object.create(null);
  entries.forEach(function (e) {
    const k = keyFn(e);
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(e.panel_span_ms);
  });
  const out = Object.create(null);
  Object.keys(buckets).sort().forEach(function (k) {
    out[k] = summarize(buckets[k].slice().sort(function (a, b) { return a - b; }));
  });
  return out;
}

// 순수 오라클. I/O 없음 — `audit`이 읽어서 주입한다.
function aggregate(records, opts) {
  const o = opts || {};
  const list = Array.isArray(records) ? records : [];
  const repoRoot = typeof o.repoRoot === 'string' ? o.repoRoot : null;

  const result = {
    tool: 'leadtime',
    axis: 'panel_span',
    state: 'ok',
    files_scanned: list.length,
    records: 0,
    pre_measurement: 0,
    pre_measurement_records: [],
    out_of_corpus: 0,
    parse_failures: 0,
    read_error: !!o.readError,
    parse_errors: [],
    sources: Array.isArray(o.sources) ? o.sources : [],
  };

  const parsed = [];
  list.forEach(function (r) {
    const name = (r && r.name) || '(unnamed)';
    const p = corpus.parseRecord(r && r.text);
    if (p.kind === 'out_of_corpus') { result.out_of_corpus += 1; return; }
    if (p.kind === 'pre_measurement') {
      result.pre_measurement += 1;
      result.pre_measurement_records.push(name);
      return;
    }
    if (!p.ok) {
      result.parse_failures += 1;
      result.parse_errors.push({ record: name, error: p.error });
      return;
    }
    p.name = name;
    parsed.push(p);
  });
  result.records = parsed.length;

  // 부재 규칙 (b) — non-finite는 분포에서 빼되 이름을 남긴다. 0으로 접지 않는다.
  const observed = [];
  const missing = [];
  parsed.forEach(function (p) {
    const m = p.measurement || {};
    const ms = m.wall_clock_ms;
    if (!Number.isFinite(ms)) { missing.push(p.name); return; }
    observed.push({
      record: p.name,
      verdict: String(m.verdict || 'unknown'),
      halt_stage: (typeof m.halt_stage === 'string' && m.halt_stage) ? m.halt_stage : null,
      panel_span_ms: ms,
      recorded_at: (typeof m.recorded_at === 'string' && m.recorded_at) ? m.recorded_at : null,
      plan_path: normalizePlanPath(m.plan_path, repoRoot),
      reviewed_plan_hash: (typeof m.reviewed_plan_hash === 'string' && m.reviewed_plan_hash)
        ? m.reviewed_plan_hash : null,
    });
  });

  const inCorpus = result.records + result.pre_measurement + result.parse_failures;
  result.coverage = {
    panel_records: inCorpus,
    measurable: result.records,
    unmeasurable: result.pre_measurement + result.parse_failures,
    counts_are_lower_bound: inCorpus > result.records,
    panel_span_observed: observed.length,
    panel_span_missing: missing.length,
    panel_span_missing_records: missing,
  };

  const damaged = result.read_error || result.parse_failures > 0;

  // 부재 규칙 (a) — 관측 0건이면 `panel_span` 키 자체를 싣지 않는다. 측정 가능
  // 레코드가 0건인 경우와 "레코드는 있는데 벽시계가 전건 결측"인 경우가 모두
  // 여기로 온다. 후자를 ok로 두면 관측 0건짜리 분포가 실려 UI3이 열린다.
  if (observed.length === 0) {
    result.state = damaged ? 'degraded' : 'blind';
    return result;
  }

  const valuesAsc = observed.map(function (e) { return e.panel_span_ms; })
    .sort(function (a, b) { return a - b; });

  result.panel_span = Object.assign({
    unit: 'ms',
    method: 'nearest-rank',
  }, summarize(valuesAsc), {
    by_verdict: stratify(observed, function (e) { return e.verdict; }),
    by_halt_stage: stratify(observed, function (e) {
      return e.halt_stage === null ? COMPLETED_KEY : e.halt_stage;
    }),
    // 원값을 전건 싣는다(DD3) — 분포 주장은 재계산으로 반증 가능해야 한다.
    records: observed.slice().sort(function (a, b) {
      return a.panel_span_ms - b.panel_span_ms;
    }),
  });

  result.state = damaged ? 'degraded' : 'ok';
  return result;
}

function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const read = corpus.readReviewRecords(root);
  return aggregate(read.records, {
    readError: read.read_error,
    sources: read.sources,
    repoRoot: root,
  });
}

function fmtMin(ms) {
  return (ms / 60000).toFixed(1) + 'min';
}

function renderHuman(r) {
  const L = [];
  L.push('panel-span leadtime — state=' + r.state +
    ' records=' + r.records +
    ' pre_measurement=' + r.pre_measurement +
    ' parse_failures=' + r.parse_failures +
    ' out_of_corpus=' + r.out_of_corpus +
    ' read_error=' + r.read_error);
  // UI3 — 커버리지는 어떤 출력에서도 값보다 먼저 나온다.
  L.push('  coverage: ' + r.coverage.measurable + '/' + r.coverage.panel_records +
    ' panel records measurable' +
    (r.coverage.counts_are_lower_bound ? ' — counts below are a LOWER BOUND' : '') +
    '; panel_span observed ' + r.coverage.panel_span_observed + '/' + r.coverage.measurable +
    ' (missing ' + r.coverage.panel_span_missing + ')');
  if (!r.panel_span) {
    L.push('  (no distribution reported — 0 panel_span observations; absence is not a value of zero)');
    return L.join('\n');
  }
  const s = r.panel_span;
  L.push('  panel_span (' + s.method + ', n=' + s.n + '): min=' + fmtMin(s.min) +
    ' p50=' + fmtMin(s.p50) + ' p90=' + fmtMin(s.p90) + ' max=' + fmtMin(s.max));
  L.push('  by_verdict:');
  Object.keys(s.by_verdict).forEach(function (k) {
    const b = s.by_verdict[k];
    L.push('    ' + k + ': n=' + b.n + ' p50=' + fmtMin(b.p50) + ' max=' + fmtMin(b.max));
  });
  L.push('  by_halt_stage:');
  Object.keys(s.by_halt_stage).forEach(function (k) {
    const b = s.by_halt_stage[k];
    L.push('    ' + k + ': n=' + b.n + ' p50=' + fmtMin(b.p50) + ' max=' + fmtMin(b.max));
  });
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'leadtime — panel_span (plan-review gate wall-clock) distribution over the review corpus',
    '',
    'usage: node plugins/mccp/scripts/lib/leadtime.js [--json] [--repo-root <path>]',
    '',
    '  --json              emit the full aggregate as JSON',
    '  --repo-root <path>  repo to scan (default: git rev-parse --show-toplevel, else cwd)',
    '  -h, --help          this message',
    '',
    'exit: 0 ok · 1 degraded (read error / parse failure) · 2 blind (0 observations)',
    '',
    'This measures ONLY the panel span (5.2a started-at -> record write). It is not an',
    'end-to-end lead time: panel-end -> ship is M2, and /mccp:work entry is owned by C2.',
    'It sets no thresholds (C7 owns those).',
    '',
  ].join('\n'));
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
      warn('BLIND — 0 panel_span observations. Absence is NOT a value of zero; ' +
        'no distribution is reported.');
      break;
    case 'degraded':
      warn('DEGRADED — the corpus could not be read in full ' +
        '(read_error=' + result.read_error + ' parse_failures=' + result.parse_failures + '). ' +
        'Coverage below is itself unreliable.');
      result.parse_errors.forEach(function (e) {
        warn('  parse failure: ' + e.record + ' — ' + e.error);
      });
      break;
    default:
      break;
  }
  // 상태와 무관하게 코퍼스 경계를 항상 말한다(UI3). 침묵하면 하한이 전수로 읽힌다.
  if (result.pre_measurement > 0) {
    warn('coverage: ' + result.pre_measurement + ' panel record(s) predate the ' +
      '`## Measurement` block — counts are a LOWER BOUND over ' +
      result.coverage.panel_records + ' panel records.');
  }
  if (result.coverage.panel_span_missing > 0) {
    warn('coverage: ' + result.coverage.panel_span_missing + ' measurable record(s) carry no ' +
      '`wall_clock_ms` — excluded from the distribution, NOT folded to zero:');
    result.coverage.panel_span_missing_records.forEach(function (n) {
      warn('  panel_span missing: ' + n);
    });
  }
  process.exit(exitCodeForState(result.state));
}

module.exports = {
  aggregate: aggregate,
  audit: audit,
  percentile: percentile,
  normalizePlanPath: normalizePlanPath,
  renderHuman: renderHuman,
  COMPLETED_KEY: COMPLETED_KEY,
  NON_REPO_PATH: NON_REPO_PATH,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
  exitCodeForState: exitCodeForState,
};

if (require.main === module) main(process.argv.slice(2));
