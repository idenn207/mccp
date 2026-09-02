'use strict';

// leadtime-observability M1/M2 — 패널 벽시계(`panel_span`) + 패널 종료→ship
// (`post_panel_span`) 분포 집계 오라클.
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
//   `/mccp:work` 진입 → …   — 그 이벤트를 생산하는 것은 **C2**이고 이 축은 소비만 한다(UI5).
//   임계값 · 자동 분기      — **C7**이 소유한다. 이 도구는 분포만 내고 숫자를 정하지 않는다(UI4).
//
// ── M2: `post_panel_span` — 패널 종료 → ship ─────────────────────────────────
//
// 두 끝 앵커를 **각각** 낸다. 절대 합치지 않는다(DD2) — 오늘 커버리지가 사실상
// 동률이라 어느 쪽이 옳은지 근거가 없고, 합치는 순간 그 선택이 영원히 검증되지 않는다.
// 두 계열의 불일치 자체가 지표다(`disagreement`).
//
//   ledger_basename — 패널 레코드의 `plan_path` basename ↔ completion-ledger
//                     엔트리의 `plan_basename`. 앵커 시각은 `completed_at`.
//   ship_plan_hash  — 패널 레코드의 `reviewed_plan_hash` ↔ `mccp-pr-codex`
//                     receipt의 `plan_hash`. 앵커 시각은 `meta.created_at`.
//
// ship 자격은 **재구현하지 않는다**(DD14). `pr-ship-gate.js`가 export한
// `deriveShipDecision(receipt, {forceOverrideActive})`의 반환값 그대로다 —
// receipt **전체**(`meta` 포함)를 넘겨야 `hasSkipProof` 층이 발동하고(무증거 skip
// 배제), `forceOverrideActive`를 묶어야 audited override로 실제 머지된 ship이
// no-ship으로 접히지 않는다. 그 위에 아무 규칙도 얹지 않는다.
//
// ── 증인은 비대칭으로 쓴다 (Implement-Codex R1 F1 흡수) ──────────────────────
//
// 미짝 레코드를 DD4의 5종으로 가를 때 쓰는 증인은 4종이고 **방향에 따라 자격이
// 다르다**. 넷 다 `yes` / `no` / `unavailable` 3-state다.
//
//   W0 반대축 앵커      ship 자격 O — 그 자체가 ship 기록이다
//   W1 archived/의 plan ship 자격 O — §3.11 C2: PRD 전체 완료 후에만 옮긴다
//   W2 implement receipt ship 자격 X — 구현이 돌았다는 증거이지 ship의 증거가 아니다
//   W3 git이 plan 경로를 건드림  ship 자격 X — plan 작성 커밋만으로 참이 된다
//
//   부정 방향(`not_shipped` 주장) — **넷 전부 `no`**. 만장일치가 아니면 성립 안 함.
//   긍정 방향(`anchor_absent` 주장) — **자격 있는 증인(W0·W1)이 `yes`**일 때만.
//
// W2·W3을 긍정 방향에 쓰면 커밋된 모든 plan이 ship된 것으로 보인다. 그래서 그 둘은
// 만장일치 부정의 구성원으로만 쓴다. W3의 `no`(= 한 번도 커밋된 적 없음)는 실제로
// 유의미하고 도달 가능한 부정 관측이다 — 작업 중인 미추적 plan이 그것이다.
//
// ── `unavailable`은 `no`가 아니다 (DD4·DD15 · R1 F2 흡수) ────────────────────
//
//   source_unavailable(src) := src.present === false || src.read_error === true
//
// 증인의 소스가 그렇다면 그 증인은 `no`가 아니라 `unavailable`이고, 그러면
// 만장일치가 깨져 `not_shipped`를 단언할 수 없다 — `unclassified`가 된다.
// "증인이 부정했다"와 "증인이 없다"는 다른 사실이고, 후자를 전자로 접으면
// 계측 부재가 단언으로 승격한다. `mccp-implement-codex`는 §3.12상 working-tree
// only라 다른 클론에서는 디렉토리 자체가 없다 — DD4가 최악으로 명시한 경로다.
// git은 spawn 실패·비영점 exit·timeout이 전부 `unavailable`이고, **성공한 빈
// 이력만** `no`다.
//
// 이 술어는 **증인 축 전용**이다. 축 상태(`damaged`)에는 걸지 않는다 —
// `corpus.js:670`을 그대로 미러해 `read_error || parse_failures > 0`이며
// `present:false`를 포함하지 않는다. 선택적 소스의 부재는 정상이고(예:
// `.claude/reviews/archive`), 합치면 정상 저장소가 degraded로 떨어진다(DD15).
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
// ── 컨테이너는 하나다 · 최상위 state는 합성값이다 (DD11) ─────────────────────
//
// `panel_span`과 `post_panel_span`은 **최상위 형제 키**이고 각자 `state`를 갖는다.
// `axes` 맵도 `axes_present` 배열도 만들지 않는다 — "어느 축이 present한가"의 유일한
// 답은 **실려 있는 축 키의 집합**이다(이중 진실원 제거). 최상위 `axis` 스칼라는 두
// 축을 대표하지 못하므로 제거했다.
//
// 최상위 `state`는 **실린 축들의 사다리 최악값**(degraded > blind > ok)이고
// `state_is_composite:true`를 동반한다. 실린 축이 하나도 없으면 합성이 정의되지
// 않으므로 `blind`다. exit code는 이 합성값을 따른다.
//
// **damaged-first는 부재보다 우선하며 두 축에 똑같이 걸린다.** damaged인 축은
// 관측 0건이어도 키를 싣고 `degraded`로 낸다(분포 없이 state만). 키를 지우면
// 합성에서 빠져 최상위가 `ok`로 남는 fail-open이 된다 — read_error가 사다리에
// 있어야 하는 이유와 정확히 같은 논리다.
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

// ── M2: 앵커 소스 상수 ───────────────────────────────────────────────────────

const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');
const SHIP_RECEIPT_SUBDIR = path.join('.claude', 'receipts', 'mccp-pr-codex');
const IMPLEMENT_RECEIPT_SUBDIR = path.join('.claude', 'receipts', 'mccp-implement-codex');
// §3.11 — archived plan의 목적지는 단일이다.
const ARCHIVED_PLAN_SUBDIR = path.join('.claude', 'PRPs', 'plans', 'archived');

const ANCHOR_LEDGER = 'ledger_basename';
const ANCHOR_SHIP = 'ship_plan_hash';
const ANCHOR_SERIES = Object.freeze([ANCHOR_LEDGER, ANCHOR_SHIP]);

// DD4의 닫힌 사유 집합. 열거 순서가 곧 판정 순서다. 이 5개 키는 건수가 0이어도
// 항상 실린다 — 부재 규칙 (c)(관측 0건인 층은 키를 만들지 않는다)와 반대인데,
// 그것은 층화(열린 집합)와 분류(닫힌 집합)가 다른 것이기 때문이다. 합계 등식
// `unmatched === Σ(counts)`가 검사 가능하려면 분모가 전부 보여야 한다(§3.11 C3).
const UNMATCHED_REASONS = Object.freeze([
  'no_plan_path',
  'key_mismatch',
  'anchor_absent',
  'not_shipped',
  'unclassified',
]);

// 증인 4종. ship 자격은 W0·W1만 갖는다(비대칭 — 헤더 참조).
const WITNESSES = Object.freeze([
  'opposite_anchor', 'archived_plan', 'implement_receipt', 'git_history',
]);
const SHIP_QUALIFIED_WITNESSES = Object.freeze(['opposite_anchor', 'archived_plan']);

// DD15 — 증인 축 전용 술어. 축 상태(`damaged`)에는 걸지 않는다.
function sourceUnavailable(src) {
  if (!src || typeof src !== 'object') return true;
  return src.present === false || src.read_error === true;
}

// `corpus.js:670`을 그대로 미러한다. `present:false`는 포함하지 않는다.
function sourceDamaged(src) {
  if (!src || typeof src !== 'object') return false;
  return src.read_error === true || (Number(src.parse_failures) || 0) > 0;
}

function emptySource(dir) {
  return { dir: toPosix(dir), present: false, read_error: false, parse_failures: 0, files: 0 };
}

function parseIsoMs(v) {
  if (typeof v !== 'string' || v === '') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function planBasename(planPath) {
  if (typeof planPath !== 'string' || planPath === '' || planPath === NON_REPO_PATH) return null;
  const parts = toPosix(planPath).split('/');
  const base = parts[parts.length - 1];
  return base || null;
}

// `derive-decision --command mccp:prp-implement`와 같은 규칙 — plan basename에서
// `.plan.md`를 벗긴다. 증인 W2가 찾는 receipt 파일명이다.
function slugFromBasename(base) {
  if (typeof base !== 'string' || base === '') return null;
  return base.replace(/\.plan\.md$/i, '').replace(/\.md$/i, '');
}

// ── M2: 앵커 소스 리더 (I/O — `audit`만 호출한다) ────────────────────────────
//
// `evidence-audit.js`의 리더를 재사용하지 **않는다**: 그것들은 `present`도
// child-process 상태도 내지 않아 `source_unavailable`을 판정할 수 없다
// (Implement-Codex R1 F2). 여기 리더는 전부 `{dir, present, read_error,
// parse_failures, files}`를 낸다.

function readJsonDir(root, subdir, onEntry) {
  const dir = path.join(root, subdir);
  const src = emptySource(subdir);
  if (!fs.existsSync(dir)) return src;
  src.present = true;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    src.read_error = true;
    return src;
  }
  names.forEach(function (name) {
    if (!name.endsWith('.json')) return;
    src.files += 1;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!onEntry(parsed, name)) src.parse_failures += 1;
    } catch (_err) {
      src.parse_failures += 1;
    }
  });
  return src;
}

// RAW ledger — decision-dedup 뷰가 아니다. 같은 decision을 N번 재-PR하면 N개
// 파일이 각각 후보다(`evidence-audit.js:11-16` 규약).
// PR-Codex R1 F1 — 이 축이 앵커로 쓰는 필드는 `decision_id`가 아니라 **시각**이다.
// `decision_id`만 검사하면 `completed_at`이 깨진 엔트리가 "정상 파싱"으로 세어지고,
// 그 후보는 `pickAnchor`가 `Number.isFinite` 가드로 조용히 버려 미짝으로만 나타난다
// — `parse_failures`가 0이라 `anchorsDamaged`도 false로 남는다. 그러면 앵커 코퍼스가
// 스키마째 어긋난 상황이 **완전한 측정으로 보인다**. 그것은 이 도구의 문서가
// "부재와 손상은 다르다"로 금지한 바로 그 상태다(post-panel-span.md). 그래서 시각
// 결측·불량은 여기서 schema failure로 세고 소스를 damaged로 만든다 — fail-closed.
function readLedger(root) {
  const entries = [];
  const src = readJsonDir(root, LEDGER_SUBDIR, function (parsed) {
    const e = parsed && parsed.entry;
    if (!e || typeof e.decision_id !== 'string' || e.decision_id === '') return false;
    if (parseIsoMs(e.completed_at) === null) return false;
    entries.push(e);
    return true;
  });
  return { entries: entries, source: src };
}

// 같은 이유로 ship receipt는 `meta.created_at`이 앵커다(위 주석 참조).
function readShipReceipts(root) {
  const receipts = [];
  const src = readJsonDir(root, SHIP_RECEIPT_SUBDIR, function (j) {
    if (!j || typeof j.decision_id !== 'string' || j.decision_id === '') return false;
    if (parseIsoMs(j.meta && j.meta.created_at) === null) return false;
    receipts.push(j);
    return true;
  });
  return { receipts: receipts, source: src };
}

// 증인 W2. §3.12상 working-tree only라 다른 클론에서는 디렉토리 자체가 없다 —
// 그 경우 `present:false`이므로 증인은 `unavailable`이 된다.
function readImplementReceiptSlugs(root) {
  const dir = path.join(root, IMPLEMENT_RECEIPT_SUBDIR);
  const src = emptySource(IMPLEMENT_RECEIPT_SUBDIR);
  const slugs = [];
  if (!fs.existsSync(dir)) return { slugs: slugs, source: src };
  src.present = true;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    src.read_error = true;
    return { slugs: slugs, source: src };
  }
  names.forEach(function (n) {
    if (!n.endsWith('.json')) return;
    src.files += 1;
    slugs.push(n.replace(/\.json$/i, ''));
  });
  return { slugs: slugs, source: src };
}

// 증인 W1. §3.11 — 목적지는 `.claude/PRPs/plans/archived/` 단일.
function readArchivedPlanBasenames(root) {
  const dir = path.join(root, ARCHIVED_PLAN_SUBDIR);
  const src = emptySource(ARCHIVED_PLAN_SUBDIR);
  const basenames = [];
  if (!fs.existsSync(dir)) return { basenames: basenames, source: src };
  src.present = true;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    src.read_error = true;
    return { basenames: basenames, source: src };
  }
  names.forEach(function (n) {
    if (!n.endsWith('.md')) return;
    src.files += 1;
    basenames.push(n);
  });
  return { basenames: basenames, source: src };
}

// 증인 W3. **존재 여부만** 쓴다 — 커밋 시각은 읽지 않는다(DD3: git은 분류의
// 증인이지 span의 앵커가 아니다). 셸을 경유하지 않고(`execFileSync` + 고정 인자
// 배열) `--`로 경로를 구분해 인자 주입을 막는다. spawn 실패 · ENOENT · 비영점
// exit · timeout은 전부 `available:false`이며, **성공한 빈 출력만** "건드린 적
// 없음"이라는 실제 부정 관측이다.
function readGitTouchedPaths(root, planPaths) {
  const out = { available: false, touched: [], reason: 'not-attempted' };
  const paths = Array.isArray(planPaths) ? planPaths.filter(function (p) {
    return typeof p === 'string' && p !== '' && p !== NON_REPO_PATH;
  }) : [];
  if (paths.length === 0) {
    out.available = true;
    out.reason = 'no-paths-to-query';
    return out;
  }
  let stdout;
  try {
    stdout = execFileSync('git', ['log', '--pretty=format:', '--name-only', '--'].concat(paths), {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (_err) {
    out.reason = 'git-exec-failed';
    return out;
  }
  out.available = true;
  out.reason = 'ok';
  const seen = Object.create(null);
  String(stdout).split(/\r?\n/).forEach(function (line) {
    const t = line.trim();
    if (t) seen[toPosix(t)] = true;
  });
  out.touched = Object.keys(seen);
  return out;
}

// ── M2: ship 자격 판정 — 오라클을 부른다, 재구현하지 않는다 (DD14) ───────────
//
// 세 겹(`resolveEffectiveVerdict` 경유 · `SHIP_VERDICTS` 멤버십 ·
// `hasSkipProof` 무증거 skip 배제)이 전부 `deriveShipDecision` 안에 있으므로
// 한 번의 호출로 상속한다. receipt **전체**(`meta` 포함)를 넘기고
// `forceOverrideActive`를 반드시 묶는다 — 둘 중 하나라도 빠지면 포함/배제가
// 조용히 뒤집힌다. 판정 근거는 전부 출력에 실어 필터가 켜져 있음을 관측 가능하게
// 한다.
function qualifyShipReceipts(receipts, shipGate) {
  const gate = shipGate || require('./pr-ship-gate');
  const qualified = [];
  const tally = {
    ship_receipts_total: 0,
    ship_receipts_qualified: 0,
    ship_receipts_unproven_skip: 0,
    ship_receipts_override_qualified: 0,
  };
  (Array.isArray(receipts) ? receipts : []).forEach(function (r) {
    tally.ship_receipts_total += 1;
    const overrideActive = !!(r && r.meta && r.meta.pr_codex_force_override === true);
    const d = gate.deriveShipDecision(r, { forceOverrideActive: overrideActive });
    if (d.blockingVerdict === 'skipped-unproven') tally.ship_receipts_unproven_skip += 1;
    if (!d.ship) return;
    tally.ship_receipts_qualified += 1;
    // blockingVerdict가 남아 있는데 ship이면 override가 자격을 만든 것이다.
    if (overrideActive && d.blockingVerdict !== null) tally.ship_receipts_override_qualified += 1;
    qualified.push(r);
  });
  return { qualified: qualified, tally: tally };
}

// ── M2: 후보 선택 규칙 (DD5) ─────────────────────────────────────────────────
//
// 패널 시각 **이후 가장 이른 것**, 그것이 없으면 패널 시각 **이전 가장 늦은 것**.
// 후자는 음수 span이 되며 그대로 보고한다(DD6) — clamp하면 앵커가 뒤집힌 실재
// 사고가 "즉시 ship"으로 보인다. fallback 절이 없으면 음수 span이 정의상 생성될
// 수 없어 DD6의 경보가 구조적으로 도달 불가가 된다.
// PR-Codex R2 F1 — 짝은 **패널 이후** 후보로만 맺는다.
//
// 이전에는 `after || before`로 폴백해, 패널 이후 앵커가 없으면 **가장 최근의 이전**
// 후보를 골랐다. 같은 basename/hash가 재리뷰되면 그 패널이 **직전 lifecycle의 ship**과
// 짝지어져 음수 span이 나오고, 그 짝은 축을 degraded로 만들면서도 `hits`에 먼저 들어가
// `by_anchor`·백분위·사람 출력에 그대로 남았다. 커버리지도 함께 부풀었다 — 관측되지
// 않은 ship이 "매치"로 세어지므로. 그것은 UI6("없는 기록을 소급 생성하지 않고 과거 시각을
// 추정해 미짝을 메우지 않는다")의 정면 위반이다.
//
// 이제 `picked`는 패널 이후 최초 후보뿐이고, 이전 후보는 버리지 않고 `prePanel`로
// 분리해 진단에 싣는다 — DD6의 취지("조용히 접지 말고 표면화하고 degrade")는 유지하되
// 짝을 만들지는 않는다. 짝이 없으면 그 레코드는 증인 규칙으로 분류된다.
function pickAnchor(candidates, panelMs) {
  let after = null;
  let before = null;
  candidates.forEach(function (c) {
    if (!Number.isFinite(c.at_ms)) return;
    if (c.at_ms >= panelMs) {
      if (after === null || c.at_ms < after.at_ms) after = c;
    } else if (before === null || c.at_ms > before.at_ms) {
      before = c;
    }
  });
  return { picked: after, prePanel: after ? null : before };
}

// ── M2: post_panel_span 집계 (순수 — 모든 I/O는 opts로 주입된다) ────────────
//
// 입력 `entities`는 파싱된 패널 레코드 전건이다(`wall_clock_ms` 유무와 무관 —
// 이 축의 시작점은 벽시계가 아니라 `recorded_at`이다).
//
// `opts.anchors`:
//   ledger  {entries[], source}
//   ship    {receipts[], source}            — 자격 필터 전 원본
//   archived{basenames[], source}           — 증인 W1
//   implement{slugs[], source}              — 증인 W2
//   git     {available, touched[]}          — 증인 W3
//   shipGate                                — 주입 가능(test 전용). 기본은 실모듈.
function computePostPanelSpan(entities, anchorsIn) {
  const A = anchorsIn || {};
  const ledgerSrc = (A.ledger && A.ledger.source) || emptySource(LEDGER_SUBDIR);
  const shipSrc = (A.ship && A.ship.source) || emptySource(SHIP_RECEIPT_SUBDIR);
  const archivedSrc = (A.archived && A.archived.source) || emptySource(ARCHIVED_PLAN_SUBDIR);
  const implementSrc = (A.implement && A.implement.source) || emptySource(IMPLEMENT_RECEIPT_SUBDIR);
  const git = A.git || { available: false, touched: [], reason: 'not-provided' };

  const shipQual = qualifyShipReceipts((A.ship && A.ship.receipts) || [], A.shipGate);
  const ledgerEntries = (A.ledger && A.ledger.entries) || [];

  // 축(계열)별 소스 가용성. DD13 — 반대축 증인에도 같은 규칙이 걸린다.
  const seriesSourceUnavailable = {};
  seriesSourceUnavailable[ANCHOR_LEDGER] = sourceUnavailable(ledgerSrc);
  seriesSourceUnavailable[ANCHOR_SHIP] = sourceUnavailable(shipSrc);

  const anchorsDamaged = sourceDamaged(ledgerSrc) || sourceDamaged(shipSrc);

  // ── 앵커 후보 색인 ────────────────────────────────────────────────────────
  const ledgerByBasename = Object.create(null);
  const ledgerByPlanHash = Object.create(null);
  const ledgerByDecision = Object.create(null);
  ledgerEntries.forEach(function (e) {
    const at = parseIsoMs(e.completed_at);
    const cand = { at_ms: at, at: e.completed_at || null, decision_id: e.decision_id || null };
    if (typeof e.plan_basename === 'string' && e.plan_basename) {
      (ledgerByBasename[e.plan_basename] || (ledgerByBasename[e.plan_basename] = [])).push(cand);
    }
    if (typeof e.plan_file_hash === 'string' && e.plan_file_hash) {
      (ledgerByPlanHash[e.plan_file_hash] || (ledgerByPlanHash[e.plan_file_hash] = [])).push(cand);
    }
    if (typeof e.decision_id === 'string' && e.decision_id) {
      (ledgerByDecision[e.decision_id] || (ledgerByDecision[e.decision_id] = [])).push(cand);
    }
  });

  const shipByPlanHash = Object.create(null);
  const shipByDecision = Object.create(null);
  shipQual.qualified.forEach(function (r) {
    const at = parseIsoMs(r.meta && r.meta.created_at);
    const cand = { at_ms: at, at: (r.meta && r.meta.created_at) || null, decision_id: r.decision_id || null };
    if (typeof r.plan_hash === 'string' && r.plan_hash) {
      (shipByPlanHash[r.plan_hash] || (shipByPlanHash[r.plan_hash] = [])).push(cand);
    }
    if (typeof r.decision_id === 'string' && r.decision_id) {
      (shipByDecision[r.decision_id] || (shipByDecision[r.decision_id] = [])).push(cand);
    }
  });

  const archivedSet = Object.create(null);
  ((A.archived && A.archived.basenames) || []).forEach(function (b) { archivedSet[b] = true; });
  const implementSet = Object.create(null);
  ((A.implement && A.implement.slugs) || []).forEach(function (x) { implementSet[x] = true; });
  const touchedSet = Object.create(null);
  (git.touched || []).forEach(function (p) { touchedSet[p] = true; });

  // ── 레코드별 조인 ─────────────────────────────────────────────────────────
  const eligible = [];
  const noPanelTimestamp = [];
  entities.forEach(function (e) {
    const ms = parseIsoMs(e.recorded_at);
    // 패널 종료 시각이 없으면 이 축의 span은 정의되지 않는다. 미짝으로 접지 않고
    // 이름으로 남긴다 — 부재 규칙 (b)의 축 단위 대우다.
    if (ms === null) { noPanelTimestamp.push(e.record); return; }
    eligible.push({ e: e, panelMs: ms });
  });

  // 패널보다 앞선 앵커 후보 — 짝으로 쓰지 않되 조용히 버리지도 않는다(DD6의 취지).
  const prePanelAnchors = [];
  const matched = {};
  const perRecord = {};
  ANCHOR_SERIES.forEach(function (k) { matched[k] = Object.create(null); perRecord[k] = []; });

  eligible.forEach(function (item) {
    const e = item.e;
    const base = planBasename(e.plan_path);
    const slug = slugFromBasename(base);
    const hash = e.reviewed_plan_hash;

    const cands = {};
    cands[ANCHOR_LEDGER] = (base && ledgerByBasename[base]) || [];
    cands[ANCHOR_SHIP] = (hash && shipByPlanHash[hash]) || [];

    ANCHOR_SERIES.forEach(function (k) {
      // 소스를 못 읽었으면 그 계열의 조인 자체가 성립하지 않는다.
      if (seriesSourceUnavailable[k]) return;
      const sel = pickAnchor(cands[k], item.panelMs);
      if (sel.prePanel) {
        prePanelAnchors.push({
          anchor: k,
          record: e.record,
          panel_recorded_at: e.recorded_at,
          anchor_at: sel.prePanel.at,
          lag_ms: item.panelMs - sel.prePanel.at_ms,
        });
      }
      const picked = sel.picked;
      if (!picked) return;
      matched[k][e.record] = {
        record: e.record,
        panel_recorded_at: e.recorded_at,
        anchor_at: picked.at,
        span_ms: picked.at_ms - item.panelMs,
        candidates: cands[k].length,
      };
    });

    item.base = base;
    item.slug = slug;
    item.hash = hash;
  });

  // ── 증인 판정 (3-state) ───────────────────────────────────────────────────
  //
  // `unavailable`은 `no`가 아니다. 그것이 이 함수의 전부다.
  function witnessesFor(item, seriesKey) {
    const opposite = seriesKey === ANCHOR_LEDGER ? ANCHOR_SHIP : ANCHOR_LEDGER;
    const w = {};

    // W0 — 반대축 앵커. 그 축의 소스가 unavailable이면 증인도 unavailable(DD13).
    if (seriesSourceUnavailable[opposite]) w.opposite_anchor = 'unavailable';
    else w.opposite_anchor = matched[opposite][item.e.record] ? 'yes' : 'no';

    // W1 — archived/의 plan. 디렉토리 부재/읽기실패는 unavailable.
    if (sourceUnavailable(archivedSrc)) w.archived_plan = 'unavailable';
    else if (!item.base) w.archived_plan = 'unavailable';
    else w.archived_plan = archivedSet[item.base] ? 'yes' : 'no';

    // W2 — mccp-implement-codex receipt. §3.12상 working-tree only.
    if (sourceUnavailable(implementSrc)) w.implement_receipt = 'unavailable';
    else if (!item.slug) w.implement_receipt = 'unavailable';
    else w.implement_receipt = implementSet[item.slug] ? 'yes' : 'no';

    // W3 — git 이력. 성공한 빈 이력만 `no`다.
    if (!git.available) w.git_history = 'unavailable';
    else if (!item.e.plan_path || item.e.plan_path === NON_REPO_PATH) w.git_history = 'unavailable';
    else w.git_history = touchedSet[item.e.plan_path] ? 'yes' : 'no';

    return w;
  }

  // ── 미짝 사유 분해 (DD4 + R1 F1 비대칭) ───────────────────────────────────
  function classify(item, seriesKey) {
    // 1. no_plan_path — 물어볼 키가 없다.
    if (!item.base) return { reason: 'no_plan_path' };

    // 2. key_mismatch — 양쪽 존재, 키만 불일치. 같은 소스 안에서 **다른 축의
    //    식별자**로는 대응물이 찾아지는데 이 축의 키로만 안 맞는 경우다.
    if (seriesKey === ANCHOR_LEDGER) {
      const viaHash = (item.hash && ledgerByPlanHash[item.hash]) || [];
      const viaDecision = (item.slug && ledgerByDecision[item.slug]) || [];
      if (viaHash.length > 0 || viaDecision.length > 0) return { reason: 'key_mismatch' };
    } else {
      const viaDecision = (item.slug && shipByDecision[item.slug]) || [];
      if (viaDecision.length > 0) return { reason: 'key_mismatch' };
    }

    const w = witnessesFor(item, seriesKey);

    // 3. anchor_absent — **자격 있는** ship 증인이 yes일 때만(R1 F1).
    //    W2·W3은 자격이 없다: 구현이 돌았다/plan이 커밋됐다는 것은 ship이 아니다.
    for (let i = 0; i < SHIP_QUALIFIED_WITNESSES.length; i++) {
      const name = SHIP_QUALIFIED_WITNESSES[i];
      if (w[name] === 'yes') return { reason: 'anchor_absent', witness: name, witnesses: w };
    }

    // 4. not_shipped — 증인 **전부** `no`. 하나라도 yes/unavailable이면 불가.
    let allNo = true;
    for (let i = 0; i < WITNESSES.length; i++) {
      if (w[WITNESSES[i]] !== 'no') { allNo = false; break; }
    }
    if (allNo) return { reason: 'not_shipped', witnesses: w };

    // 5. unclassified — 정직한 산출이다. 다수여도 숨기지 않는다.
    return { reason: 'unclassified', witnesses: w };
  }

  // ── 계열 조립 ─────────────────────────────────────────────────────────────
  const byAnchor = {};
  const unmatched = {};
  const negativeSpans = [];

  ANCHOR_SERIES.forEach(function (k) {
    const hits = [];
    const misses = { total: 0, counts: {}, sum_equation_holds: true, by_reason: {} };
    UNMATCHED_REASONS.forEach(function (r) { misses.counts[r] = 0; misses.by_reason[r] = []; });

    eligible.forEach(function (item) {
      const m = matched[k][item.e.record];
      if (m) {
        hits.push(m);
        if (m.span_ms < 0) {
          negativeSpans.push({
            anchor: k,
            record: m.record,
            panel_recorded_at: m.panel_recorded_at,
            anchor_at: m.anchor_at,
            span_ms: m.span_ms,
          });
        }
        return;
      }
      misses.total += 1;
      const c = classify(item, k);
      misses.counts[c.reason] += 1;
      const row = { record: item.e.record };
      if (c.witness) row.witness = c.witness;
      // not_shipped·unclassified·anchor_absent 행에 증인 3-state 전건을 실어
      // 판정을 재계산으로 반증 가능하게 한다.
      if (c.witnesses) row.witnesses = c.witnesses;
      misses.by_reason[c.reason].push(row);
    });

    let sum = 0;
    UNMATCHED_REASONS.forEach(function (r) { sum += misses.counts[r]; });
    misses.sum_equation_holds = (sum === misses.total);

    const valuesAsc = hits.map(function (h) { return h.span_ms; })
      .sort(function (a, b) { return a - b; });

    byAnchor[k] = Object.assign({
      source_unavailable: seriesSourceUnavailable[k],
    }, summarize(valuesAsc), {
      records: hits.slice().sort(function (a, b) { return a.span_ms - b.span_ms; }),
    });
    unmatched[k] = misses;
  });

  // ── 교차표 + 불일치 (지표 4, Task 3) ──────────────────────────────────────
  let both = 0, onlyLedger = 0, onlyShip = 0, neither = 0;
  const disagreementRecords = [];
  eligible.forEach(function (item) {
    const l = matched[ANCHOR_LEDGER][item.e.record];
    const sh = matched[ANCHOR_SHIP][item.e.record];
    if (l && sh) {
      both += 1;
      disagreementRecords.push({
        record: item.e.record,
        ledger_anchor_at: l.anchor_at,
        ship_anchor_at: sh.anchor_at,
        // 한쪽만 매치된 레코드는 불일치가 아니라 **커버리지 차이**다. 그것들은
        // only_ledger / only_ship로 따로 세고 이 블록에 절대 넣지 않는다.
        anchor_delta_ms: sh.span_ms - l.span_ms,
      });
    } else if (l) onlyLedger += 1;
    else if (sh) onlyShip += 1;
    else neither += 1;
  });
  const absAsc = disagreementRecords.map(function (d) { return Math.abs(d.anchor_delta_ms); })
    .sort(function (a, b) { return a - b; });
  const disagreement = Object.assign({
    unit: 'ms',
    method: 'nearest-rank',
    measured_over: 'abs(anchor_delta_ms)',
  }, {
    n: absAsc.length,
    p50: percentile(absAsc, 50),
    max: absAsc.length ? absAsc[absAsc.length - 1] : undefined,
  }, {
    records: disagreementRecords.slice().sort(function (a, b) {
      return Math.abs(b.anchor_delta_ms) - Math.abs(a.anchor_delta_ms);
    }),
  });

  const observedTotal = byAnchor[ANCHOR_LEDGER].n + byAnchor[ANCHOR_SHIP].n;

  const coverage = Object.assign({
    eligible: eligible.length,
    no_panel_timestamp: noPanelTimestamp.length,
    no_panel_timestamp_records: noPanelTimestamp,
    matched_ledger_basename: byAnchor[ANCHOR_LEDGER].n,
    matched_ship_plan_hash: byAnchor[ANCHOR_SHIP].n,
    both: both,
    only_ledger: onlyLedger,
    only_ship: onlyShip,
    neither: neither,
    ledger_entries_total: ledgerEntries.length,
  }, shipQual.tally, {
    sources: [ledgerSrc, shipSrc, archivedSrc, implementSrc],
    git_witness: { available: git.available, reason: git.reason || null },
  });

  return {
    prePanelAnchors: prePanelAnchors,
    observedTotal: observedTotal,
    anchorsDamaged: anchorsDamaged,
    byAnchor: byAnchor,
    unmatched: unmatched,
    negativeSpans: negativeSpans,
    disagreement: disagreement,
    coverage: coverage,
  };
}

// 사다리 최악값. 실린 축이 하나도 없으면 합성이 정의되지 않으므로 `blind`다.
const STATE_SEVERITY = Object.freeze({ ok: 0, blind: 1, degraded: 2 });

function compositeState(axisStates) {
  if (!axisStates.length) return 'blind';
  let worst = 'ok';
  axisStates.forEach(function (st) {
    if ((STATE_SEVERITY[st] || 0) > (STATE_SEVERITY[worst] || 0)) worst = st;
  });
  return worst;
}

// 순수 오라클. I/O 없음 — `audit`이 읽어서 주입한다.
function aggregate(records, opts) {
  const o = opts || {};
  const list = Array.isArray(records) ? records : [];
  const repoRoot = typeof o.repoRoot === 'string' ? o.repoRoot : null;

  const result = {
    tool: 'leadtime',
    // `axis` 스칼라는 제거됐다(DD11) — 두 축을 대표하지 못한다. "어느 축이
    // present한가"의 유일한 답은 실려 있는 축 키의 집합이다.
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
  //
  // `entities`는 파싱된 레코드 **전건**이다. `post_panel_span`의 시작점은 벽시계가
  // 아니라 `recorded_at`이므로, `wall_clock_ms`가 결측인 레코드도 M2 축에서는
  // 여전히 조인 대상이다 — 두 축의 분모를 같게 만들면 M2가 M1의 결측을 물려받는다.
  const observed = [];
  const missing = [];
  const entities = [];
  parsed.forEach(function (p) {
    const m = p.measurement || {};
    const ms = m.wall_clock_ms;
    const entity = {
      record: p.name,
      recorded_at: (typeof m.recorded_at === 'string' && m.recorded_at) ? m.recorded_at : null,
      plan_path: normalizePlanPath(m.plan_path, repoRoot),
      reviewed_plan_hash: (typeof m.reviewed_plan_hash === 'string' && m.reviewed_plan_hash)
        ? m.reviewed_plan_hash : null,
    };
    entities.push(entity);
    if (!Number.isFinite(ms)) { missing.push(p.name); return; }
    observed.push({
      record: p.name,
      verdict: String(m.verdict || 'unknown'),
      halt_stage: (typeof m.halt_stage === 'string' && m.halt_stage) ? m.halt_stage : null,
      panel_span_ms: ms,
      recorded_at: entity.recorded_at,
      plan_path: entity.plan_path,
      reviewed_plan_hash: entity.reviewed_plan_hash,
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
  const axisStates = [];

  // ── 축 1: panel_span ──────────────────────────────────────────────────────
  //
  // 부재 규칙 (a) — 관측 0건이면 `panel_span` 키 자체를 싣지 않는다. 측정 가능
  // 레코드가 0건인 경우와 "레코드는 있는데 벽시계가 전건 결측"인 경우가 모두
  // 여기로 온다. 후자를 ok로 두면 관측 0건짜리 분포가 실려 UI3이 열린다.
  //
  // **단, damaged-first가 부재보다 우선한다**(DD11): damaged인데 관측이 0건이면
  // 키를 지우지 않고 `state`만 실어 `degraded`로 낸다. 지우면 합성에서 빠져
  // 최상위가 `ok`로 남는 fail-open이 된다.
  if (observed.length === 0) {
    if (damaged) {
      result.panel_span = { state: 'degraded' };
      axisStates.push('degraded');
    }
  } else {
    const valuesAsc = observed.map(function (e) { return e.panel_span_ms; })
      .sort(function (a, b) { return a - b; });

    result.panel_span = Object.assign({
      state: damaged ? 'degraded' : 'ok',
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
    axisStates.push(result.panel_span.state);
  }

  // ── 축 2: post_panel_span (M2) ────────────────────────────────────────────
  //
  // 앵커가 주입되지 않은 호출(M1 픽스처 전부)은 이 축을 아예 만들지 않는다 —
  // DD12: 그 픽스처에는 앵커 소스가 주입되지 않으므로 read_error가 없고,
  // damaged-first가 발동하지 않아 키가 부재하며, 실린 축이 `panel_span` 하나뿐이라
  // 합성 최악값이 M1과 동일하다.
  if (o.anchors) {
    const pps = computePostPanelSpan(entities, o.anchors);
    const ppsDamaged = pps.anchorsDamaged;
    // 음수 span은 clamp하지 않고 보고하며, 1건이라도 있으면 그 축이 degraded다(DD6).
    // 합계 등식이 깨져도 degraded다(DD4).
    const equationBroken = ANCHOR_SERIES.some(function (k) {
      return pps.unmatched[k].sum_equation_holds === false;
    });

    if (pps.observedTotal === 0) {
      if (ppsDamaged) {
        // damaged-first — 관측 0건이어도 키를 싣는다. 사유 분해는 싣지 않는다(DD13).
        result.post_panel_span = { state: 'degraded', coverage: pps.coverage };
        axisStates.push('degraded');
      } else if (pps.prePanelAnchors.length > 0) {
        // 관측은 0건이지만 "앵커가 있긴 한데 전부 패널보다 앞선다"는 것은 관측된
        // 사실이다. 축 키를 만들지 않으면 그 사실이 통째로 사라져, 짝을 안 맺기로 한
        // 결정이 곧 증거 인멸이 된다. 분포는 없으므로 싣지 않는다(부재 규칙 a).
        result.post_panel_span = {
          state: 'ok',
          coverage: pps.coverage,
          pre_panel_anchors: pps.prePanelAnchors,
        };
        axisStates.push('ok');
      }
    } else {
      const st = (ppsDamaged || pps.negativeSpans.length > 0 || equationBroken) ? 'degraded' : 'ok';
      result.post_panel_span = {
        state: st,
        unit: 'ms',
        method: 'nearest-rank',
        by_anchor: pps.byAnchor,
        disagreement: pps.disagreement,
        negative_spans: pps.negativeSpans,
        coverage: pps.coverage,
      };
      // 패널보다 앞선 앵커 후보는 짝이 아니지만 관측 사실이다 — 0건이면 키를 만들지
      // 않고(부재 규칙 a), 있으면 싣는다. 짝이 아니므로 분포·커버리지에는 들어가지 않는다.
      if (pps.prePanelAnchors.length > 0) {
        result.post_panel_span.pre_panel_anchors = pps.prePanelAnchors;
      }
      // DD13 — 앵커 소스를 못 읽었으면 사유 분해를 내지 않는다. 빈 분해를 싣는 것은
      // "분류했더니 0건"과 구분되지 않고, 계측 고장이 완전한 측정으로 보인다.
      if (!ppsDamaged) result.post_panel_span.unmatched = pps.unmatched;
      axisStates.push(st);
    }
  }

  // 최상위 state는 **실린 축들의** 사다리 최악값이다. 실린 축이 없으면 합성이
  // 정의되지 않으므로 blind. exit code는 이 값을 따른다.
  result.state = compositeState(axisStates);
  result.state_is_composite = true;
  return result;
}

// I/O 층. 순수 오라클이 필요로 하는 모든 소스를 여기서 읽어 주입한다 —
// `aggregate`는 child_process도 fs도 건드리지 않는다.
function audit(opts) {
  const o = opts || {};
  const root = o.repoRoot || process.cwd();
  const read = corpus.readReviewRecords(root);

  const ledger = readLedger(root);
  const ship = readShipReceipts(root);
  const archived = readArchivedPlanBasenames(root);
  const implement = readImplementReceiptSlugs(root);

  // git 증인은 코퍼스에 실재하는 plan 경로에 대해서만 한 번에 묻는다.
  const planPaths = Object.create(null);
  read.records.forEach(function (r) {
    const p = corpus.parseRecord(r && r.text);
    if (!p || !p.ok || !p.measurement) return;
    const norm = normalizePlanPath(p.measurement.plan_path, root);
    if (norm && norm !== NON_REPO_PATH) planPaths[norm] = true;
  });
  const git = readGitTouchedPaths(root, Object.keys(planPaths));

  return aggregate(read.records, {
    readError: read.read_error,
    sources: read.sources,
    repoRoot: root,
    anchors: {
      ledger: ledger,
      ship: ship,
      archived: archived,
      implement: implement,
      git: git,
    },
  });
}

function fmtMin(ms) {
  return (ms / 60000).toFixed(1) + 'min';
}

function fmtDay(ms) {
  return (ms / 86400000).toFixed(2) + 'd';
}

// UI3 — 커버리지 줄이 값보다 **먼저** 나온다. 합성 state는 합성임을 문구로 밝힌다.
function renderPostPanelSpan(r) {
  const L = [];
  const s = r.post_panel_span;
  if (!s) {
    L.push('  post_panel_span: (axis not loaded — no anchor observation and no source damage;' +
      ' absence is not a value of zero)');
    return L;
  }
  L.push('  post_panel_span — state=' + s.state);
  const c = s.coverage || {};
  L.push('    coverage: eligible ' + c.eligible +
    ' · matched ledger_basename ' + c.matched_ledger_basename +
    ' · matched ship_plan_hash ' + c.matched_ship_plan_hash +
    ' · both ' + c.both + ' only_ledger ' + c.only_ledger +
    ' only_ship ' + c.only_ship + ' neither ' + c.neither);
  L.push('    ship receipts: ' + c.ship_receipts_qualified + '/' + c.ship_receipts_total +
    ' qualified (unproven-skip ' + c.ship_receipts_unproven_skip +
    ' · override-qualified ' + c.ship_receipts_override_qualified + ')');
  if (!s.by_anchor) {
    L.push('    (no distribution reported — anchor sources damaged; the reason breakdown is' +
      ' withheld because an empty breakdown is indistinguishable from "classified, found none")');
    return L;
  }
  ANCHOR_SERIES.forEach(function (k) {
    const b = s.by_anchor[k];
    if (!b || !b.n) {
      L.push('    ' + k + ': n=0 (no join — absence is not a value of zero)');
      return;
    }
    L.push('    ' + k + ' (' + s.method + ', n=' + b.n + '): min=' + fmtDay(b.min) +
      ' p50=' + fmtDay(b.p50) + ' p90=' + fmtDay(b.p90) + ' max=' + fmtDay(b.max));
  });
  // 두 계열은 절대 합치지 않는다(DD2). 불일치 자체가 지표다.
  const d = s.disagreement;
  if (d && d.n) {
    L.push('    disagreement (both axes matched, n=' + d.n + ', over ' + d.measured_over +
      '): p50=' + fmtDay(d.p50) + ' max=' + fmtDay(d.max));
  } else {
    L.push('    disagreement: n=0 (no record matched BOTH axes — this is coverage, not agreement)');
  }
  if (s.pre_panel_anchors && s.pre_panel_anchors.length) {
    L.push('    pre-panel anchor candidates: ' + s.pre_panel_anchors.length +
      ' (NOT paired — a prior lifecycle anchor cannot date this panel ship)');
  }
  if (s.negative_spans && s.negative_spans.length) {
    L.push('    negative spans: ' + s.negative_spans.length +
      ' (anchor precedes the panel — reported, NEVER clamped to zero)');
  }
  if (s.unmatched) {
    ANCHOR_SERIES.forEach(function (k) {
      const u = s.unmatched[k];
      if (!u) return;
      const parts = UNMATCHED_REASONS.map(function (rr) { return rr + '=' + u.counts[rr]; });
      L.push('    unmatched[' + k + ']: ' + u.total + ' = ' + parts.join(' ') +
        (u.sum_equation_holds ? '' : '  *** SUM EQUATION BROKEN ***'));
    });
  }
  return L;
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
  if (r.state_is_composite) {
    L.push('  (state above is COMPOSITE — the worst of the loaded axes, not a single axis)');
  }
  if (!r.panel_span || !r.panel_span.n) {
    L.push('  (no panel_span distribution reported — 0 panel_span observations; absence is not a value of zero)');
    L.push.apply(L, renderPostPanelSpan(r));
    return L.join('\n');
  }
  const s = r.panel_span;
  L.push('  panel_span — state=' + s.state);
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
  L.push.apply(L, renderPostPanelSpan(r));
  return L.join('\n');
}

function printUsage() {
  process.stdout.write([
    'leadtime — panel_span (plan-review gate wall-clock) + post_panel_span (panel-end -> ship)',
    '',
    'usage: node plugins/mccp/scripts/lib/leadtime.js [--json] [--repo-root <path>]',
    '',
    '  --json              emit the full aggregate as JSON',
    '  --repo-root <path>  repo to scan (default: git rev-parse --show-toplevel, else cwd)',
    '  -h, --help          this message',
    '',
    'exit: 0 ok · 1 degraded (read error / parse failure) · 2 blind (0 observations)',
    '',
    'panel_span = 5.2a started-at -> record write. post_panel_span = record write -> ship,',
    'reported as TWO anchor series (ledger_basename, ship_plan_hash) that are NEVER merged;',
    'their disagreement is itself the metric. Neither is an end-to-end lead time: /mccp:work',
    'entry is owned by C2. It sets no thresholds (C7 owns those).',
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
      warn('DEGRADED — the corpus or an anchor source could not be read in full ' +
        '(read_error=' + result.read_error + ' parse_failures=' + result.parse_failures + '). ' +
        'Coverage below is itself unreliable.');
      if (result.post_panel_span && result.post_panel_span.state === 'degraded') {
        (((result.post_panel_span.coverage || {}).sources) || []).forEach(function (src) {
          if (sourceDamaged(src)) {
            warn('  anchor source damaged: ' + src.dir +
              ' (read_error=' + src.read_error + ' parse_failures=' + src.parse_failures + ')');
          }
        });
        const neg = result.post_panel_span.negative_spans || [];
        if (neg.length) {
          warn('  ' + neg.length + ' negative span(s) — an anchor precedes its panel. ' +
            'Reported, never clamped: a clamped negative reads as an instant ship.');
        }
      }
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
  // ── M2 ──
  ANCHOR_SERIES: ANCHOR_SERIES,
  UNMATCHED_REASONS: UNMATCHED_REASONS,
  WITNESSES: WITNESSES,
  SHIP_QUALIFIED_WITNESSES: SHIP_QUALIFIED_WITNESSES,
  sourceUnavailable: sourceUnavailable,
  sourceDamaged: sourceDamaged,
  planBasename: planBasename,
  slugFromBasename: slugFromBasename,
  pickAnchor: pickAnchor,
  qualifyShipReceipts: qualifyShipReceipts,
  compositeState: compositeState,
  readLedger: readLedger,
  readShipReceipts: readShipReceipts,
  readArchivedPlanBasenames: readArchivedPlanBasenames,
  readImplementReceiptSlugs: readImplementReceiptSlugs,
  readGitTouchedPaths: readGitTouchedPaths,
};

if (require.main === module) main(process.argv.slice(2));
