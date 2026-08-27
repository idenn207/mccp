'use strict';

// diverse-agent-review M8 — plan-review 레코드 코퍼스 집계 오라클.
//
// #8은 배선 milestone이 아니라 판정 milestone이다. PRD가 묻는 순서가 있다 —
// "승인이 발급되는 경로가 존재하는가"에 먼저 답해야 `3of4` + K=3의 적정성을 물을
// 수 있다. `record.js`가 `.claude/reviews/`에 적어 온 코퍼스가 이미 그 판정에
// 충분하므로, 이 도구는 그 코퍼스를 읽어 **세기만** 한다. 판정은 문서가 한다.
//
// read-only · LLM-free · fs + child_process(git) 외 의존 없음. 게이트 경로를 한
// 줄도 건드리지 않는다(UI6): `cli.js` 하위 subcommand가 아니라 `evidence-audit.js`
// 선례대로 standalone이다.
//
// 임계값을 갖지 않는다 (DN11 · UI11). 승인율 목표치도 "적정 quorum"도 여기 없다.
//
// ── 코퍼스의 경계: 무엇이 레코드인가 ─────────────────────────────────────────
//
// `.claude/reviews/`에는 여러 생산자의 문서가 섞여 있다 — PR 리뷰 · santa-loop
// 리뷰 · local 리뷰 · security 리뷰. 이 도구의 코퍼스는 그중 **`record.js`가 쓴
// 패널 레코드**뿐이고, 그 서명은 `record.js:317`이 언제나 쓰는 첫 줄
// `# Plan Review Panel — <slug>`이다. 파일명(`plan-review-*.md`)은 서명이
// 아니다 — 같은 접두사를 쓰는 손으로 쓴 문서가 실재한다.
//
// 그래서 입력은 셋으로 갈린다. 셋을 하나로 뭉치면 세 개의 다른 사실이 한
// 숫자가 되고, 그 숫자는 어느 것도 뜻하지 않는다.
//
//   out_of_corpus  — 다른 생산자의 문서. 코퍼스가 아니므로 결손이 아니다.
//                    그래도 종류별로 세어 출력한다(조용히 버리지 않는다).
//   pre_measurement — 패널 레코드이지만 `## Measurement` 블록 자체가 없다.
//                    M4가 그 블록을 도입하기 전 레코드다. 오독할 측정값이
//                    애초에 없으므로 계측 고장이 아니라 **코퍼스의 시간 경계**다.
//                    전건 이름을 출력하고 `coverage`에 하한으로 반영한다.
//   parse_failure  — 패널 레코드이고 `## Measurement`가 있는데 읽히지 않는다.
//                    이것이 진짜 고장이다.
//
// ── state precedence ladder (evidence-audit.js 미러) ─────────────────────────
//
//   degraded (exit 1) — 디렉토리 read 실패(hard) 또는 parse_failures>0(soft).
//   blind    (exit 2) — 레코드 0건. **부재는 결함 부재가 아니다**(DN3). 이때
//                       어떤 비율도 보고하지 않는다 — "승인 0건"을 판정으로
//                       읽는 것이 #6·#7이 이미 한 번 지불한 오류다.
//   ok       (exit 0) — 레코드 ≥1이고 측정 가능한 것이 전부 읽혔다.
//
// hard read error와 blind가 우선하고(죽은 소스/전면 부재가 모든 것을 이긴다),
// 그 다음이 parse-발 degraded다.
//
// `pre_measurement`를 degraded에 넣지 **않는** 이유는 편의가 아니라 신호
// 보존이다: 그 13건은 영구히 존재하므로 degraded에 넣으면 이 도구는 어떤
// 코퍼스에서도 항상 degraded가 되고, 그러면 진짜 손상이 그 상시 신호에 묻혀
// 보이지 않는다. 항상 켜진 신호는 정보를 나르지 않는다 — DN3("부재를 판정으로
// 읽지 마라")의 대우다. 대신 `coverage`가 그 하한성을 매 출력에 명시한다.
//
// ── binding_axis를 reason 문자열에서 읽는 이유 ────────────────────────────────
//
// plan-review 패널(architect/MEDIUM · HIGH `286471ae`)이 정확히 지적한 것: 기록된
// `measurement.quorum`에는 `rolesMin`이 **없다**. `quorum.js:189`의 판정은
// `roles < rolesMin`이므로, 측정 JSON만으로는 K가 binding이었는지 알 수 없다.
//
// 그래서 이 도구는 `quorum.js:184-197`이 **직접 쓴** reason 문자열을 1차 소스로
// 읽는다. 그 세 접두사는 오라클 자신의 출력이라 재구성이 아니라 인용이다:
//   - 'only N of M required responses'      → M binding
//   - 'only N distinct role(s), need M'     → K binding
//   - 'N blocking finding(s)'               → findings binding
// 측정 JSON으로 교차 검증이 가능한 축(M: responded<required)은 교차 검증하고,
// 불일치하면 조용히 한쪽을 고르지 않고 `cross_check_conflicts`로 표면화한다.
//
// **읽을 수 없으면 0이 아니라 `unknown`이다.** reason 줄이 없는 차단 레코드는
// `binding_axis.unknown`에 들어가며 어떤 축에도 0으로 기여하지 않는다. K는 측정
// JSON에 교차 소스가 아예 없으므로 이 규칙이 K 축의 유일한 정직성 장치다.
//
// ── 구조적 0을 관측으로 착각하지 않는다 ──────────────────────────────────────
//
// 어떤 카운터는 코퍼스가 아니라 상류 코드 때문에 0이다. 그런 값을 "관측했더니
// 0"으로 읽으면 없는 근거가 생긴다 — 이 도구가 F6에서 한 번, 단일통과 축에서 또
// 한 번 실제로 지불한 오류다.
//
//   F6         — `## Findings`의 합성 FAIL 행만 세면 0이다. `record.js#findingRows`가
//                finding 0건일 때만 그 행을 쓰기 때문이다. 정본은 Refutation 표다.
//   단일통과   — converged 레코드만 세면 0이다. `decide.js:338`이 완화를 언제나
//                `'divergent'`로 봉인하기 때문이다. 그래서 `single_pass` 축은
//                verdict와 무관하게 센다.
//
// 규칙은 하나다: **어떤 축이 0이면, 그 0이 코퍼스에서 온 것인지 상류 불변식에서
// 온 것인지 먼저 답한다.** 후자면 그 카운터는 관측이 아니라 회귀 가드이고,
// 관측은 별도 축이 맡아야 한다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STATE_EXIT_CODES = Object.freeze({
  ok: 0,
  degraded: 1,
  blind: 2,
});

function exitCodeForState(state) {
  const code = STATE_EXIT_CODES[state];
  return typeof code === 'number' ? code : 1;
}

// 비재귀 2경로. record.js#reviewRecordPath가 쓰는 곳과 그 아카이브.
const REVIEW_SUBDIRS = Object.freeze([
  path.join('.claude', 'reviews'),
  path.join('.claude', 'reviews', 'archive'),
]);

// DN5 — K 자연 실험의 분할점. `MCCP_PLAN_REVIEW_ROLES_MIN=1`을 tracked
// settings.json으로 승격한 커밋이다. 하드코딩 부채(invariant/LOW)는 인정하되
// 두 가지로 완화한다: `--k-split-ref`로 덮어쓸 수 있고, ref가 해소되지 않으면
// 조용히 다른 지점에서 가르지 않고 `k_split.state='unresolved'`를 낸다.
const DEFAULT_K_SPLIT_REF = '794c4de';

const REASON_M_RE = /only\s+(\d+)\s+of\s+(\d+)\s+required responses/i;
const REASON_K_RE = /only\s+(\d+)\s+distinct role\(s\),\s*need\s+(\d+)/i;
const REASON_F_RE = /(\d+)\s+blocking finding\(s\)/i;

// 단일통과 완화의 흔적. `decide.js:338`이 reason 문자열에 직접 쓰는 리터럴이라
// 재구성이 아니라 인용이다.
const SINGLE_PASS_RE = /MCCP_REVIEW_SINGLE_PASS/;

// quorum.js#normalizeSeverity가 차단으로 세는 집합. 미인식 severity도 차단이다
// ("무게를 읽을 수 없는 finding은 버려도 되는 finding이 아니다") — F6 후보 판정에
// 그대로 반영한다.
const BLOCKING_SEVERITIES = Object.freeze(['CRITICAL', 'HIGH']);
const NON_BLOCKING_SEVERITIES = Object.freeze(['MEDIUM', 'LOW']);

// record.js#findingRows가 합성하는 F6 행의 severity. 리뷰어가 finding 없이
// verdict=fail만 낸 경우다.
const SYNTHETIC_FAIL_SEVERITY = 'FAIL';

function warn(line) {
  process.stderr.write('[mccp:plan-review-corpus] ' + line + '\n');
}

// ── markdown 표 파싱 ─────────────────────────────────────────────────────────

// record.js#cell은 백슬래시를 **먼저** 이스케이프하고 그 다음 파이프를
// 이스케이프한다(`\` → `\\`, `|` → `\|`). 역변환은 반드시 역순이어야 한다:
// 이스케이프되지 않은 파이프로만 쪼갠 뒤 `\|`→`|`, `\\`→`\`를 그 순서로 되돌린다.
// 순서를 뒤집으면 리터럴 백슬래시 뒤에 오는 진짜 구분자를 표현할 수 없다.
function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      cur += ch + line[i + 1];
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  // 선행/후행 `|`가 만드는 빈 양끝을 떼어낸다.
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map(unescapeCell);
}

function unescapeCell(raw) {
  return String(raw)
    .replace(/\\\|/g, '|')
    .replace(/\\\\/g, '\\')
    .trim();
}

function isSeparatorRow(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

// `## <name>` 아래, 다음 `## ` 전까지의 줄.
function sectionLines(lines, name) {
  const start = lines.findIndex(function (l) { return l.trim() === '## ' + name; });
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

// 섹션 안의 첫 마크다운 표를 행 배열로. 표가 없으면 빈 배열(섹션은 있으나
// "None — ..." 산문인 정상 케이스).
function tableRows(lines) {
  if (!lines) return [];
  const rows = [];
  let seenHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('|') === -1) {
      if (seenHeader) break;
      continue;
    }
    if (isSeparatorRow(line)) continue;
    if (!seenHeader) { seenHeader = true; continue; }   // 헤더 행
    rows.push(splitRow(line));
  }
  return rows;
}

// ── 레코드 파싱 ──────────────────────────────────────────────────────────────

// record.js:317이 언제나 쓰는 첫 줄. 이것이 코퍼스 소속의 유일한 판별자다.
const PANEL_TITLE_RE = /^#\s+Plan Review Panel\s+—/;

function isPanelRecord(text) {
  if (typeof text !== 'string') return false;
  const first = text.split(/\r?\n/).find(function (l) { return l.trim() !== ''; });
  return typeof first === 'string' && PANEL_TITLE_RE.test(first.trim());
}

// parseRecord(text) → { ok, kind, measurement, findings, refutation, reason, error }
//
// `kind`는 코퍼스 경계의 판정이다 — 'record' · 'pre_measurement' ·
// 'out_of_corpus' · 'parse_failure'. `measurement`는 ```json 펜스 안의
// 객체이고, 그것을 못 읽으면 레코드 전체가 실패다 — 판정 축이 전부 거기 있으므로
// 부분 성공으로 세면 조용한 저계수가 된다.
function parseRecord(text) {
  const out = {
    ok: false,
    kind: 'parse_failure',
    measurement: null,
    findings: [],
    refutation: [],
    reason: null,
    sections: { findings: false, refutation: false },
    error: null,
  };
  if (typeof text !== 'string' || text.trim() === '') {
    out.error = 'empty or non-string record';
    return out;
  }
  if (!isPanelRecord(text)) {
    out.kind = 'out_of_corpus';
    out.error = 'not a plan-review panel record (no `# Plan Review Panel —` title)';
    return out;
  }
  const lines = text.split(/\r?\n/);

  const measLines = sectionLines(lines, 'Measurement');
  if (measLines === null) {
    out.kind = 'pre_measurement';
    out.error = 'panel record predates the `## Measurement` block (M4)';
    return out;
  }
  const fenceStart = measLines.findIndex(function (l) { return l.trim() === '```json'; });
  if (fenceStart === -1) {
    out.error = '`## Measurement` has no ```json fence';
    return out;
  }
  const body = [];
  for (let i = fenceStart + 1; i < measLines.length; i++) {
    if (measLines[i].trim() === '```') break;
    body.push(measLines[i]);
  }
  try {
    const parsed = JSON.parse(body.join('\n'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      out.error = 'measurement JSON is not an object';
      return out;
    }
    out.measurement = parsed;
  } catch (err) {
    out.error = 'measurement JSON parse failed: ' + err.message;
    return out;
  }

  const reasonLine = lines.find(function (l) { return /^>\s*Reason:/.test(l); });
  out.reason = reasonLine ? reasonLine.replace(/^>\s*Reason:\s*/, '').trim() : null;

  // Findings: | Perspective | Severity | Claim | Evidence |
  const fLines = sectionLines(lines, 'Findings');
  out.sections.findings = fLines !== null;
  tableRows(fLines).forEach(function (c) {
    if (c.length < 2) return;
    out.findings.push({
      perspective: c[0],
      severity: c[1],
      claim: c.length > 2 ? c[2] : '',
      evidence: c.length > 3 ? c[3] : '',
    });
  });

  // Refutation attempted: | Perspective | Verdict | What was attacked |
  const rLines = sectionLines(lines, 'Refutation attempted');
  out.sections.refutation = rLines !== null;
  tableRows(rLines).forEach(function (c) {
    if (c.length < 2) return;
    out.refutation.push({
      perspective: c[0],
      verdict: c[1],
      attacked: c.length > 2 ? c[2] : '',
    });
  });

  out.ok = true;
  out.kind = 'record';
  return out;
}

// ── 축별 분류 ────────────────────────────────────────────────────────────────

function num(v) { return Number.isFinite(v) ? v : null; }

function normSeverity(v) {
  return String(v === null || v === undefined ? '' : v).trim().toUpperCase();
}

// quorum.js와 동일 규칙: CRITICAL/HIGH는 차단, MEDIUM/LOW는 비차단, 그 밖의
// 미인식 severity는 **차단**이다(무게를 읽을 수 없는 finding은 버릴 수 없다).
function isBlockingSeverity(sev) {
  if (sev === SYNTHETIC_FAIL_SEVERITY) return false;   // F6 합성 행은 별도 축
  if (BLOCKING_SEVERITIES.indexOf(sev) !== -1) return true;
  return NON_BLOCKING_SEVERITIES.indexOf(sev) === -1;
}

// 차단 레코드 하나에 대해 M/K/findings 중 무엇이 성립했는지. reason이 1차 소스,
// 측정 JSON이 교차 검증(M 축만 가능).
function classifyBinding(rec) {
  const reason = rec.reason;
  const m0 = rec.measurement;
  const q = (m0 && typeof m0.quorum === 'object' && m0.quorum !== null) ? m0.quorum : null;

  if (typeof reason !== 'string' || reason === '') {
    return { readable: false, m: null, k: null, findings: null, conflict: null };
  }

  const m = REASON_M_RE.test(reason);
  const k = REASON_K_RE.test(reason);
  const f = REASON_F_RE.test(reason);

  // M 축 교차 검증. 양쪽 다 읽힐 때만 대조하고, 어긋나면 한쪽을 고르지 않는다.
  let conflict = null;
  if (q && num(q.responded) !== null && num(q.required) !== null) {
    const structuralM = q.responded < q.required;
    if (structuralM !== m) {
      conflict = 'reason says M-binding=' + m + ' but measurement.quorum says responded(' +
        q.responded + ') < required(' + q.required + ') = ' + structuralM;
    }
  }
  return { readable: true, m: m, k: k, findings: f, conflict: conflict };
}

// F6 (quorum.js:175-181 합성 FAIL) 기여도.
//
// **소스는 `## Refutation attempted` 표다.** `## Findings`의 `FAIL` 행이 아니다.
// record.js#findingRows는 실패 리뷰어가 finding을 **하나도 안 냈을 때만** 합성
// 행을 쓰므로(`emitted === 0`), MEDIUM만 낸 실패 리뷰어는 그 표에 FAIL로 나타나지
// 않는다. 그런데 quorum.js는 그 리뷰어에 대해서도 여전히 합성 blocking finding을
// 쌓는다 — 즉 그 리뷰어야말로 F6이 실제로 짊어진 사례다. 합성 행만 세면 F6의
// 기여도를 구조적으로 0으로 관측하게 되고(실측: 코퍼스 전체 합성 행 0건),
// 그것은 DN7이 묻는 질문에 답하지 않는다.
//
// 세는 것 둘:
//   (a) `solo_fail_reviewers` — verdict=fail이면서 차단 severity finding을
//       하나도 동반하지 않은 리뷰어 인스턴스. 그 리뷰어의 차단 사유는 F6뿐이었다.
//   (b) `record_flipped_by_f6` — 레코드에 verdict=fail이 ≥1건 있는데 레코드
//       전체의 실물 차단 finding이 0건. F6이 없었으면 그 레코드는 통과했다.
//       §3.14 해제 조건에 직접 걸리는 수치다.
//
// refutation 표가 없는 레코드는 합성 행으로 fallback한다(부분 정보라도 0으로
// 접지 않는다).
function classifyF6(rec) {
  const bySeverity = Object.create(null);
  let realBlocking = 0;

  rec.findings.forEach(function (f) {
    const sev = normSeverity(f.severity);
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    if (sev === SYNTHETIC_FAIL_SEVERITY) return;
    if (isBlockingSeverity(sev)) realBlocking += 1;
  });

  // verdict=fail 리뷰어 집합 — refutation 표가 정본, 합성 행이 fallback.
  const failPerspectives = Object.create(null);
  rec.refutation.forEach(function (r) {
    if (r.verdict === 'fail') failPerspectives[r.perspective] = true;
  });
  if (Object.keys(failPerspectives).length === 0) {
    rec.findings.forEach(function (f) {
      if (normSeverity(f.severity) === SYNTHETIC_FAIL_SEVERITY) {
        failPerspectives[f.perspective] = true;
      }
    });
  }

  // 실패 리뷰어별로 그 관점이 실물 차단 finding을 냈는지.
  const soloFailReviewers = Object.keys(failPerspectives).filter(function (p) {
    return !rec.findings.some(function (f) {
      if (f.perspective !== p) return false;
      return isBlockingSeverity(normSeverity(f.severity));
    });
  });

  const failCount = Object.keys(failPerspectives).length;
  return {
    fail_reviewers: failCount,
    solo_fail_reviewers: soloFailReviewers.length,
    solo_fail_perspectives: soloFailReviewers,
    record_flipped_by_f6: failCount > 0 && realBlocking === 0,
    real_blocking_findings: realBlocking,
    by_severity: bySeverity,
  };
}

// ── 집계 ─────────────────────────────────────────────────────────────────────

// aggregate(records, opts) — 순수 함수. records는 {name, text} 배열.
// opts.kSplitAtMs / opts.kSplitRef / opts.readError 는 caller가 주입한다
// (git·fs 접근은 main()이 하고 오라클은 인자만 본다).
function aggregate(records, opts) {
  const o = opts || {};
  const list = Array.isArray(records) ? records : [];

  const result = {
    tool: 'plan-review-corpus',
    state: null,
    files_scanned: list.length,
    records: 0,
    // 패널 레코드이지만 `## Measurement`가 없는 것 (M4 이전). 결손이 아니라
    // 코퍼스의 시간 경계 — 전건 이름을 남긴다.
    pre_measurement: 0,
    pre_measurement_records: [],
    // 다른 생산자의 문서. 코퍼스가 아니다.
    out_of_corpus: 0,
    // 패널 레코드 + Measurement 존재 + 판독 실패. 이것만 degraded를 만든다.
    parse_failures: 0,
    read_error: !!o.readError,
    parse_errors: [],
    sources: Array.isArray(o.sources) ? o.sources : [],
  };

  const parsed = [];
  list.forEach(function (r) {
    const name = (r && r.name) || '(unnamed)';
    const p = parseRecord(r && r.text);
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

  // 코퍼스 소속(패널 레코드) 중 실제로 측정 가능했던 비율. 이 값이 1 미만인 한
  // 아래의 모든 카운트는 **하한**이다 — 그 사실을 매 출력에 싣는다(DN8).
  const inCorpus = result.records + result.pre_measurement + result.parse_failures;
  result.coverage = {
    panel_records: inCorpus,
    measurable: result.records,
    unmeasurable: result.pre_measurement + result.parse_failures,
    counts_are_lower_bound: inCorpus > result.records,
  };

  // DN3 — 코퍼스 0건이면 **어떤 비율도 출력하지 않는다**. 축 키 자체를 싣지 않아
  // 소비자가 "0으로 관측됨"과 "관측 자체가 없음"을 혼동할 수 없게 한다.
  if (parsed.length === 0) {
    result.state = (result.read_error || result.parse_failures > 0) ? 'degraded' : 'blind';
    return result;
  }

  // 1. verdicts
  const verdicts = Object.create(null);
  const sourcesSeen = Object.create(null);
  parsed.forEach(function (p) {
    const v = String((p.measurement && p.measurement.verdict) || 'unknown');
    verdicts[v] = (verdicts[v] || 0) + 1;
    const s = String((p.measurement && p.measurement.source) || 'unknown');
    sourcesSeen[s] = (sourcesSeen[s] || 0) + 1;
  });
  result.verdicts = verdicts;
  result.sources_seen = sourcesSeen;

  const converged = parsed.filter(function (p) {
    return p.measurement && p.measurement.verdict === 'converged';
  });

  // 2. pass_path — 승인 경로가 존재하는가. 존재를 주장하려면 레코드마다
  // wall-clock · hash 결속 · 단일통과 토글 흔적을 함께 보여야 한다(UI9).
  result.pass_path = {
    count: converged.length,
    entries: converged.map(function (p) {
      const m = p.measurement || {};
      return {
        record: p.name,
        plan_path: m.plan_path || null,
        wall_clock_ms: num(m.wall_clock_ms),
        hash_bound: typeof m.reviewed_plan_hash === 'string' && m.reviewed_plan_hash.length > 0,
        single_pass_trace: SINGLE_PASS_RE.test(p.reason || ''),
        quorum: m.quorum || null,
        recorded_at: m.recorded_at || null,
        reason: p.reason,
      };
    }),
    // UI9 — 단일통과 토글이 낸 진행은 승인으로 세지 않는다. **이 값은 관측이
    // 아니라 회귀 가드다**: `decide.js:338`이 완화를 언제나 `'divergent'`로
    // 봉인하므로(§3.15 "converged 위장 없음") 어떤 코퍼스에서도 구조적으로 0이고,
    // 0이 아닌 날은 그 봉인이 바뀐 날이다. 완화가 실제로 몇 번 일어났는지는 이
    // 축이 아니라 아래 `single_pass`에 있다.
    single_pass_tainted: converged.filter(function (p) {
      return SINGLE_PASS_RE.test(p.reason || '');
    }).length,
    hash_bound: converged.filter(function (p) {
      const m = p.measurement || {};
      return typeof m.reviewed_plan_hash === 'string' && m.reviewed_plan_hash.length > 0;
    }).length,
    wall_clock_ms_observed: converged
      .map(function (p) { return num(p.measurement && p.measurement.wall_clock_ms); })
      .filter(function (v) { return v !== null; }),
  };

  // 2b. single_pass — 완화가 실제로 몇 번 일어났는가.
  //
  // 이 축이 따로 있는 이유는 `pass_path.single_pass_tainted`가 converged만
  // 필터하기 때문이다. `decide.js:338`이 완화를 언제나 `'divergent'`로 봉인하므로
  // 그 카운터는 구조적으로 0이고, 그것만 읽으면 "이 코퍼스에 단일통과가 없다"로
  // 읽힌다. **잘못된 소스에서 구조적 0을 관측하는 것**은 F6에서 이미 한 번 지불한
  // 오류이며(classifyF6 주석 참조), 같은 오류를 이 축에서 반복하지 않는다.
  //
  // **이 수는 승인이 아니다.** 차단 레코드 중 이만큼은 게이트가 `divergent`를
  // 봉인하고도 작업이 진행된 경우다. 따라서 "무엇이 실제로 막았는가"를 묻는 판정은
  // `binding_axis`와 이 축을 함께 읽어야 한다 — 세는 것은 여기까지이고 그 함의를
  // 판정하는 것은 문서의 일이다(DN11).
  const singlePass = parsed.filter(function (p) {
    return SINGLE_PASS_RE.test(p.reason || '');
  });
  const isConverged = function (p) {
    return !!(p.measurement && p.measurement.verdict === 'converged');
  };
  result.single_pass = {
    records: singlePass.length,
    converged: singlePass.filter(isConverged).length,
    blocked: singlePass.filter(function (p) { return !isConverged(p); }).length,
    record_names: singlePass.map(function (p) { return p.name; }),
  };

  // 3. perspectives — 관점별 pass/fail (Refutation 표가 소스).
  const perspectives = Object.create(null);
  parsed.forEach(function (p) {
    p.refutation.forEach(function (r) {
      const key = r.perspective || '(unnamed)';
      if (!perspectives[key]) perspectives[key] = { pass: 0, fail: 0, other: 0, total: 0 };
      perspectives[key].total += 1;
      if (r.verdict === 'pass') perspectives[key].pass += 1;
      else if (r.verdict === 'fail') perspectives[key].fail += 1;
      else perspectives[key].other += 1;
    });
  });
  result.perspectives = perspectives;

  // 4. binding_axis — 차단 레코드마다 무엇이 binding이었는가.
  const blocked = parsed.filter(function (p) {
    return p.measurement && p.measurement.verdict !== 'converged';
  });
  const binding = {
    blocked_records: blocked.length,
    // M·K 질문의 정직한 모수. quorum이 평가된 적 없는 차단(L1 halt · budget halt)은
    // "M도 K도 binding이 아니었다"의 사례가 아니라 **질문이 성립하지 않은** 사례다.
    // 분모에 넣으면 손잡이 무력성 주장이 공짜로 강해진다.
    quorum_evaluated_blocked: 0,
    m_binding: 0,
    k_binding: 0,
    findings_binding: 0,
    // reason 줄이 없거나 세 접두사 중 어느 것도 매칭되지 않아 축을 판정할 수 없는
    // 레코드. **0이 아니라 여기 쌓인다.**
    unknown: 0,
    unknown_records: [],
    // L1에서 막혀 L2 quorum이 아예 평가되지 않은 레코드 (M·K 축의 모수가 아니다).
    l2_not_evaluated: 0,
    cross_check_conflicts: [],
  };
  blocked.forEach(function (p) {
    const q = (p.measurement && p.measurement.quorum) || null;
    if (q === null) binding.l2_not_evaluated += 1;
    const c = classifyBinding(p);
    if (!c.readable) {
      binding.unknown += 1;
      binding.unknown_records.push(p.name);
      return;
    }
    if (!c.m && !c.k && !c.findings) {
      // reason은 읽혔으나 quorum 3사유 중 어느 것도 아니다 — L1 halt나 budget
      // halt다. quorum이 평가된 적 없으므로 M·K 모수에 넣지 않는다.
      binding.unknown += 1;
      binding.unknown_records.push(p.name);
      return;
    }
    binding.quorum_evaluated_blocked += 1;
    if (c.m) binding.m_binding += 1;
    if (c.k) binding.k_binding += 1;
    if (c.findings) binding.findings_binding += 1;
    if (c.conflict) {
      binding.cross_check_conflicts.push({ record: p.name, detail: c.conflict });
    }
  });
  result.binding_axis = binding;

  // 5. f6
  const f6 = {
    fail_reviewer_instances: 0,
    solo_fail_reviewer_instances: 0,
    solo_fail_records: [],
    records_flipped_if_f6_removed: 0,
    flipped_records: [],
    severity_histogram: Object.create(null),
  };
  parsed.forEach(function (p) {
    const c = classifyF6(p);
    f6.fail_reviewer_instances += c.fail_reviewers;
    f6.solo_fail_reviewer_instances += c.solo_fail_reviewers;
    if (c.solo_fail_reviewers > 0) {
      f6.solo_fail_records.push({ record: p.name, perspectives: c.solo_fail_perspectives });
    }
    if (c.record_flipped_by_f6) {
      f6.records_flipped_if_f6_removed += 1;
      f6.flipped_records.push(p.name);
    }
    Object.keys(c.by_severity).forEach(function (sev) {
      f6.severity_histogram[sev] = (f6.severity_histogram[sev] || 0) + c.by_severity[sev];
    });
  });
  result.f6 = f6;

  // 6. k_split — DN5 자연 실험. ref가 해소되지 않으면 조용히 다른 지점에서
  // 가르지 않고 unresolved를 낸다.
  const splitMs = num(o.kSplitAtMs);
  if (splitMs === null) {
    result.k_split = {
      state: 'unresolved',
      ref: o.kSplitRef || DEFAULT_K_SPLIT_REF,
      reason: o.kSplitError || 'split commit timestamp not resolved',
    };
  } else {
    const before = { records: 0, converged: 0 };
    const after = { records: 0, converged: 0 };
    let undated = 0;
    parsed.forEach(function (p) {
      const raw = (p.measurement && typeof p.measurement.recorded_at === 'string')
        ? Date.parse(p.measurement.recorded_at) : NaN;
      if (!Number.isFinite(raw)) { undated += 1; return; }
      const bucket = raw < splitMs ? before : after;
      bucket.records += 1;
      if (p.measurement.verdict === 'converged') bucket.converged += 1;
    });
    result.k_split = {
      state: 'ok',
      ref: o.kSplitRef || DEFAULT_K_SPLIT_REF,
      split_at: new Date(splitMs).toISOString(),
      before: before,
      after: after,
      undated: undated,
    };
  }

  result.state = (result.read_error || result.parse_failures > 0) ? 'degraded' : 'ok';
  return result;
}

// ── 수집 (I/O) ───────────────────────────────────────────────────────────────

function readReviewRecords(root) {
  const out = { records: [], read_error: false, sources: [] };
  REVIEW_SUBDIRS.forEach(function (sub) {
    const dir = path.join(root, sub);
    const src = { dir: sub.replace(/\\/g, '/'), present: false, files: 0 };
    if (!fs.existsSync(dir)) { out.sources.push(src); return; }
    src.present = true;
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (_err) {
      out.read_error = true;
      out.sources.push(src);
      return;
    }
    names.forEach(function (name) {
      if (!name.endsWith('.md')) return;
      const abs = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(abs); } catch (_err) { out.read_error = true; return; }
      if (!stat.isFile()) return;          // 비재귀 — archive/ 자체를 재귀하지 않는다
      try {
        out.records.push({
          name: src.dir + '/' + name,
          text: fs.readFileSync(abs, 'utf8'),
        });
        src.files += 1;
      } catch (_err) {
        out.read_error = true;
      }
    });
    out.sources.push(src);
  });
  return out;
}

function resolveSplitMs(root, ref) {
  try {
    const iso = execFileSync('git', ['show', '-s', '--format=%cI', ref], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const ms = Date.parse(iso);
    return Number.isFinite(ms)
      ? { ms: ms, error: null }
      : { ms: null, error: 'unparsable commit date: ' + iso };
  } catch (err) {
    return { ms: null, error: 'git show failed for ref ' + ref + ': ' + err.message };
  }
}

function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const ref = o.kSplitRef || DEFAULT_K_SPLIT_REF;
  const read = readReviewRecords(root);
  const split = resolveSplitMs(root, ref);
  return aggregate(read.records, {
    readError: read.read_error,
    sources: read.sources,
    kSplitRef: ref,
    kSplitAtMs: split.ms,
    kSplitError: split.error,
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function renderHuman(r) {
  const L = [];
  L.push('plan-review corpus — state=' + r.state + ' records=' + r.records +
    ' pre_measurement=' + r.pre_measurement +
    ' parse_failures=' + r.parse_failures +
    ' out_of_corpus=' + r.out_of_corpus +
    ' read_error=' + r.read_error);
  if (r.coverage) {
    L.push('  coverage: ' + r.coverage.measurable + '/' + r.coverage.panel_records +
      ' panel records measurable' +
      (r.coverage.counts_are_lower_bound ? ' — counts below are a LOWER BOUND' : ''));
  }
  if (r.records === 0) {
    L.push('  (no ratios reported — absence is not a finding of zero)');
    return L.join('\n');
  }
  L.push('  verdicts: ' + JSON.stringify(r.verdicts));
  L.push('  pass_path: count=' + r.pass_path.count +
    ' hash_bound=' + r.pass_path.hash_bound +
    ' single_pass_tainted=' + r.pass_path.single_pass_tainted +
    ' wall_clock_ms=' + JSON.stringify(r.pass_path.wall_clock_ms_observed));
  L.push('  single_pass: records=' + r.single_pass.records +
    ' converged=' + r.single_pass.converged +
    ' blocked=' + r.single_pass.blocked +
    '  (relaxed runs — NOT approvals)');
  L.push('  binding_axis: blocked=' + r.binding_axis.blocked_records +
    ' quorum_evaluated=' + r.binding_axis.quorum_evaluated_blocked +
    ' m=' + r.binding_axis.m_binding +
    ' k=' + r.binding_axis.k_binding +
    ' findings=' + r.binding_axis.findings_binding +
    ' unknown=' + r.binding_axis.unknown +
    ' l2_not_evaluated=' + r.binding_axis.l2_not_evaluated);
  L.push('  f6: fail_reviewer_instances=' + r.f6.fail_reviewer_instances +
    ' solo_fail_reviewer_instances=' + r.f6.solo_fail_reviewer_instances +
    ' records_flipped_if_removed=' + r.f6.records_flipped_if_f6_removed);
  L.push('  k_split: ' + JSON.stringify(r.k_split));
  L.push('  perspectives: ' + JSON.stringify(r.perspectives));
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'Usage: node plugins/mccp/scripts/lib/plan-review/corpus.js [--json] [--repo-root <path>] [--k-split-ref <ref>]',
    '',
    'Read-only, LLM-free aggregation of plan-review panel records written by',
    'plan-review/record.js into .claude/reviews/ and .claude/reviews/archive/.',
    'Counts only — it holds no thresholds and makes no judgement (DN11).',
    '',
    'Exit: 0 ok · 1 degraded (read/parse failure) · 2 blind (zero records).',
    '',
  ].join('\n'));
}

function main(argv) {
  let asJson = false;
  let repoRoot = null;
  let ref = DEFAULT_K_SPLIT_REF;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      asJson = true;
    } else if (a === '--repo-root') {
      repoRoot = argv[i + 1];
      i++;
      if (!repoRoot) { warn('--repo-root requires a path argument'); process.exit(1); }
    } else if (a === '--k-split-ref') {
      ref = argv[i + 1];
      i++;
      if (!ref) { warn('--k-split-ref requires a ref argument'); process.exit(1); }
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

  const result = audit({ repoRoot: repoRoot, kSplitRef: ref });
  if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(renderHuman(result) + '\n');

  switch (result.state) {
    case 'blind':
      warn('BLIND — 0 records parsed. Absence is NOT a finding of zero (DN3); ' +
        'no ratio is reported.');
      break;
    case 'degraded':
      warn('DEGRADED — a panel record with a `## Measurement` block could not be read ' +
        '(read_error=' + result.read_error + ' parse_failures=' + result.parse_failures + ').');
      result.parse_errors.forEach(function (e) {
        warn('  parse failure: ' + e.record + ' — ' + e.error);
      });
      break;
    default:
      break;
  }
  // 상태와 무관하게 코퍼스 경계를 항상 말한다. `pre_measurement`는 고장이 아니라
  // 시간 경계라 state를 바꾸지 않지만, 침묵하면 카운트가 전수로 읽힌다.
  if (result.pre_measurement > 0) {
    warn('coverage: ' + result.pre_measurement + ' panel record(s) predate the ' +
      '`## Measurement` block — counts are a LOWER BOUND over ' +
      result.coverage.panel_records + ' panel records.');
    result.pre_measurement_records.forEach(function (n) {
      warn('  pre-measurement: ' + n);
    });
  }
  if (result.out_of_corpus > 0) {
    warn('scanned ' + result.out_of_corpus + ' file(s) from other producers ' +
      '(PR / santa / local / security reviews) — not panel records, not counted.');
  }
  process.exit(exitCodeForState(result.state));
}

module.exports = {
  parseRecord: parseRecord,
  aggregate: aggregate,
  audit: audit,
  splitRow: splitRow,
  classifyBinding: classifyBinding,
  classifyF6: classifyF6,
  DEFAULT_K_SPLIT_REF: DEFAULT_K_SPLIT_REF,
  STATE_EXIT_CODES: STATE_EXIT_CODES,
  exitCodeForState: exitCodeForState,
};

if (require.main === module) main(process.argv.slice(2));
