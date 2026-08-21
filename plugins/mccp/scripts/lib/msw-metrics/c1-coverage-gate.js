'use strict';

// multi-session-work-loop M7 — C1 승격을 **반증 가능하게** 종속시키는 coverage gate.
//
// 설계 근거: docs/multi-session-work-loop/feedback-loop-design.md
//
// 왜 필요한가: emit 지점 하나를 놓치면 그 게이트의 finding 은 레지스트리에 아무
// 이벤트도 남기지 않으므로 **분모에서 통째로 빠진다**. 분모가 줄면 폐쇄율이 오르고,
// 그것은 DD2 가 막는 조작 경로와 결과가 같다. "C1 이 computed 다"만으로는 그 상태와
// 정상 상태를 구별할 수 없다.
//
// **덮는 표면이 둘이고 표면마다 승인 집합이 다르다.** 하나의 목록으로 뭉뚱그리면
// 레지스트리 축이 표면 축의 넓은 목록을 물려받아 "단일 초크 포인트" 주장이
// 무력해진다. 두 상수를 분리해 선언한다.
//
// **위협 모델(정직히 명시)**: 겨냥 대상은 *우발적 미계측 emit 지점*(신규 게이트 ·
// 직접 write · 생성 코드)이지 **repo write 권한을 가진 적대적 위조자가 아니다**.
// 후자는 이 파일 자체를 고칠 수 있으므로 in-repo gate 로 원리상 방어 불가이며,
// 단일 운영자 신뢰경계라는 PRD 전제상 범위 밖이다. `--acceptance` 도 마찬가지로
// *건너뛰기*를 막고 *위조*를 막지 않는다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 레지스트리 **reader** 는 이 플러그인의 부품이므로 co-located 로 가져온다.
// `repoRoot` 는 스캔 대상 *데이터* 루트이지 코드 루트가 아니다 — 거기서 require 하면
// 트리 밖(임시 디렉토리 · 다른 저장소)을 대조할 때 모듈을 못 찾고 축이 통째로 죽는다.
// 반대로 `contractCoPresence` 는 **대상 트리의 코드 상태**를 묻는 것이 목적이므로
// 거기서만 repoRoot 기준 require 를 쓴다. 두 용도를 구분하는 것이 요점이다.
const findingsRegistry = require('../../state/findings-registry');

// ── 표면 1: finding 표면 ─────────────────────────────────────────────────────
// 위반의 의미: 계측되지 않은 finding 표면 writer — 표면 delta 가 대응 이벤트 없이 생긴다.
const APPROVED_SURFACE_WRITERS = [
  'plugins/mccp/scripts/lib/plan-review/record.js',   // 경로 helper + 마크다운 본문
  'plugins/mccp/scripts/lib/santa/seal.js',           // santa 리포트 writer
];

// ── 표면 2: 레지스트리 경로 ──────────────────────────────────────────────────
// 위반의 의미: Task 1 의 단일 초크 포인트 우회 — 정규화되지 않은 절대경로가
// git-tracked corpus 에 실린다.
//
// **emit 지점 3곳은 여기 들어가지 않는다.** 그것들은 `appendFindings()` 를 *호출*할
// 뿐 레지스트리 경로에 직접 write 하지 않으며, 목록에 넣는 순간 초크 포인트가 넷이
// 되어 주장이 거짓이 된다.
const APPROVED_REGISTRY_WRITERS = [
  'plugins/mccp/scripts/state/findings-registry.js',
];

// 감사자 자신. 이 파일은 검출 패턴을 **데이터로** 담고 있어 자기 자신을 잡는다.
const SELF_EXEMPT = 'plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js';

// 경로 토큰. `'findings'` 나 `'reviews'` 단독 리터럴은 JSON 필드명으로도 흔하므로
// **`.claude` 와의 인접**을 요구한다 — 그 요구가 없으면 finding 배열을 다루는 정상
// 파일이 전부 오검출된다(실측: 단독 토큰 스캔이 7개 파일을 잡았고 그 중 6개가 무관했다).
const SURFACE_PATH_TOKEN_RE =
  /(\.claude[/\\]reviews)|(['"]\.claude['"]\s*,\s*['"]reviews['"])/;
const REGISTRY_PATH_TOKEN_RE =
  /(\.claude[/\\]state[/\\]findings)|(['"]state['"]\s*,\s*['"]findings['"])/;

// 동사 목록은 b2-coverage-gate.js 와 **대칭으로** 유지한다. 한쪽만 넓히면
// "변수로 넘기면 잡히고 인라인이면 안 잡힌다"는 비대칭 구멍이 생긴다.
const WRITE_VERBS =
  'writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|openSync|\\bopen|' +
  'copyFileSync|copyFile|renameSync|\\brename|cpSync|\\bcp\\b|truncateSync|truncate|' +
  'symlinkSync|symlink|linkSync|\\blink';
const ANY_WRITE_CALL_RE = new RegExp('(' + WRITE_VERBS + ')\\s*\\(');
const TAINT_ASSIGN_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
const TAINT_WRITE_TARGET_RE = new RegExp(
  '(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|openSync|' +
  '\\bopen|truncateSync|truncate)\\s*\\(\\s*([A-Za-z_$][\\w$]*)');
const TAINT_DEST_TARGET_RE = new RegExp(
  '(?:renameSync|\\brename|copyFileSync|copyFile|cpSync|\\bcp\\b|symlinkSync|symlink|' +
  'linkSync|\\blink)\\s*\\(\\s*[^,]+,\\s*([A-Za-z_$][\\w$]*)');

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

// 주석 줄은 검사에서 뺀다. 넓힌 패턴이 주석까지 보면 **금지된 형태를 문서에 적는
// 행위 자체가 위반**이 되어 설명을 쓸 수 없게 된다(b2 의 같은 규칙).
function isCommentLine(line) {
  const t = String(line).trim();
  return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
}

function listJsFiles(dir, acc) {
  acc = acc || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      listJsFiles(full, acc);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

// 한 홉 taint. 경로를 먼저 변수에 담고(`const target = path.join(root, '.claude',
// 'reviews', name)`) write 줄에는 토큰이 남지 않는 형태를 덮는다. 파일 안에 토큰이
// 있다는 사실만으로 잡으면 표면을 *읽기만* 하는 정당한 파일이 걸린다.
function taintedWrites(raw, tokenRe) {
  const lines = String(raw).split(/\r?\n/);
  const tainted = new Set();
  for (let pass = 0; pass < 2; pass++) {
    for (const line of lines) {
      if (isCommentLine(line)) continue;
      const a = TAINT_ASSIGN_RE.exec(line);
      if (!a) continue;
      const name = a[1];
      const rhs = a[2];
      if (tokenRe.test(rhs)) { tainted.add(name); continue; }
      for (const t of tainted) {
        if (new RegExp('\\b' + t + '\\b').test(rhs)) { tainted.add(name); break; }
      }
    }
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    const m = TAINT_WRITE_TARGET_RE.exec(line) || TAINT_DEST_TARGET_RE.exec(line);
    if (m && tainted.has(m[1])) out.push({ line: i + 1, via: m[1] });
  }
  return out;
}

// **정직한 한계**: 한 줄 단위 텍스트 검사이고 타입 해석을 하지 않는다. 여러 단계로
// 세탁된 경로 · 런타임 동적 경로 · `plugins/mccp/scripts` 밖 · 셸 writer 는 원리상
// 못 본다. 그 축은 런타임 falsifier 가 담당한다.
function lintSurface(repoRoot, tokenRe, approved) {
  const scanRoot = path.join(repoRoot, 'plugins', 'mccp', 'scripts');
  const violations = [];
  for (const full of listJsFiles(scanRoot)) {
    const rel = toPosix(path.relative(repoRoot, full));
    if (rel.indexOf('/tests/') !== -1) continue;
    if (rel === SELF_EXEMPT) continue;
    if (approved.indexOf(rel) !== -1) continue;
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); } catch (_e) { continue; }
    const taintedLines = new Set(taintedWrites(raw, tokenRe).map(function (t) { return t.line; }));
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;
      let axis = null;
      if (tokenRe.test(line) && ANY_WRITE_CALL_RE.test(line)) axis = 'write-call-args';
      else if (taintedLines.has(i + 1)) axis = 'path-taint';
      if (axis) {
        violations.push({ file: rel, line: i + 1, axis: axis, text: line.trim().slice(0, 160) });
      }
    }
  }
  return { ok: violations.length === 0, violations: violations };
}

function staticLint(repoRoot) {
  const surface = lintSurface(repoRoot, SURFACE_PATH_TOKEN_RE, APPROVED_SURFACE_WRITERS);
  const registry = lintSurface(repoRoot, REGISTRY_PATH_TOKEN_RE, APPROVED_REGISTRY_WRITERS);
  return {
    ok: surface.ok && registry.ok,
    surface: surface,
    registry: registry,
  };
}

// ── DD10 — 계약 co-presence ─────────────────────────────────────────────────
//
// "하나의 커밋으로 착지한다"는 규율일 뿐 기제가 아니다. `computeC1` 이
// `type_separation` 계약을 요구하는데 등록된 `findings` 소스가 그것을 선언하지
// 않으면(또는 그 역) 비영점 exit 한다. 커밋 경계가 아니라 **트리 상태**를 본다.
function contractCoPresence(repoRoot) {
  const metricsPath = path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'lib',
    'msw-metrics', 'index.js');
  let consumerRequires = false;
  try {
    const src = fs.readFileSync(metricsPath, 'utf8');
    consumerRequires = /findings\.type_separation\s*===\s*true/.test(src);
  } catch (_e) { consumerRequires = false; }

  let sourceRegistered = false;
  let sourceDeclares = false;
  try {
    const derive = require(path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'derive', 'index.js'));
    sourceRegistered = !!(derive.SOURCE_SCANNERS &&
      Object.prototype.hasOwnProperty.call(derive.SOURCE_SCANNERS, 'findings'));
  } catch (_e) { sourceRegistered = false; }
  try {
    const probe = require(path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'derive',
      'sources', 'findings.js')).scanFindings(repoRoot);
    sourceDeclares = typeof probe.type_separation === 'boolean';
  } catch (_e) { sourceDeclares = false; }

  const producerPresent = sourceRegistered && sourceDeclares;
  return {
    ok: consumerRequires === producerPresent,
    consumer_requires_contract: consumerRequires,
    source_registered: sourceRegistered,
    source_declares_contract: sourceDeclares,
    detail: consumerRequires === producerPresent ? null
      : (consumerRequires
        ? 'computeC1 requires the type_separation contract but no registered findings source '
          + 'declares it — C1 is unproducible on this tree (Task 2 landed without Task 3)'
        : 'a findings source declares the contract but computeC1 does not read it — '
          + 'the anti-gaming check is inert (Task 3 landed without Task 2)'),
  };
}

// ── merge=union 적용 검사 ────────────────────────────────────────────────────
//
// 선언이 있어도 glob 이 어긋나면 미적용이므로 파일 grep 이 아니라 **git 에게 묻는다**.
// 수동 명령으로만 두면 게이트는 잘못 설정된 인프라 위에서도 통과한다 — 병합 안전성이
// 게이트 안에 있어야 하는 이유는 그것이 조용한 데이터 손실을 막는 유일한 설정이기 때문이다.
function mergeUnionCheck(repoRoot) {
  const probes = [
    '.claude/state/findings/multi-session-work-loop.jsonl',
    // 아직 존재하지 않는 이름 — glob 이 특정 파일이 아니라 패턴에 걸리는지.
    '.claude/state/findings/zzz-future-work-unit.jsonl',
  ];
  const results = [];
  let ok = true;
  for (const rel of probes) {
    let value = null;
    try {
      const out = execFileSync('git', ['check-attr', 'merge', '--', rel],
        { cwd: repoRoot, encoding: 'utf8' });
      const m = /:\s*merge:\s*(\S+)\s*$/.exec(String(out).trim());
      value = m ? m[1] : null;
    } catch (err) {
      value = 'git-unavailable: ' + ((err && err.message) || err);
    }
    if (value !== 'union') ok = false;
    results.push({ path: rel, merge: value });
  }
  return { ok: ok, probes: results };
}

// ── 런타임 falsifier ─────────────────────────────────────────────────────────
//
// 표면은 레지스트리와 **다른 코드 경로가 다른 목적으로** 쓴다 — 기록기의 기록기가
// 아니라 독립 관측이며 무한 후퇴가 아니다. 이 축이 잡는 것은 DD8 의 batch 전체 유실
// 중 **부풀리는 방향**(`finding_opened` 유실 → 분모 축소)이다.
//
// `verdict=fail` 합성 행은 제외한다: quorum 이 리뷰어의 bare fail 을 blocking finding
// 으로 합성해 기록에 싣지만(record.js) 그것은 리뷰어가 제출한 finding 이 아니므로
// emit 대상이 아니다. 두 표면의 계약이 다르다는 사실을 여기 명시한다.
const SYNTHETIC_FAIL_CLAIM = 'reviewer returned verdict=fail';

// **두 표면은 같은 술어로 세야 한다** (local review H3). `record.js#findingRows` 는
// `isObj(f)` 인 모든 finding 에 행을 쓰지만 `plan-review/cli.js#emitPanelFindings` 는
// (a) `perspective` 가 문자열이고 (b) `claim` 이 비어 있지 않은 것만 emit 하며,
// (c) 레지스트리는 `finding_id`(= work_unit·gate·perspective·severity·정규화 claim)
// 로 **fold** 한다. 이 셋을 반영하지 않고 raw 행 수를 세면 claim 없는 finding 이나
// 내용이 같은 중복 행에서 `record > registry` 가 되어, 게이트가 유실이 없는데도
// *"events were lost in the inflating direction"* 으로 **오진하며 차단**한다(실측:
// 행 3 · 이벤트 2 · fold 1 → exit 1).
//
// 그래서 표면 쪽도 (perspective, severity, 정규화 claim) 으로 fold 하고 빈 claim 을
// 뺀다. 정규화는 레지스트리의 `normalizeClaim` 을 **재사용**한다 — 여기서 다시 구현하면
// 두 술어가 다시 갈리고, 그 갈림이 정확히 이 항목이 닫는 결함이다.
function parseRecordRow(line) {
  // `cell()` 은 `\` → `\\`, `|` → `\|` 로 이스케이프하므로, 이스케이프되지 않은 `|`
  // 에서만 자른다.
  const cells = [];
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) { buf += line[i + 1]; i += 1; continue; }
    if (ch === '|') { cells.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  cells.push(buf.trim());
  // 선행·후행 `|` 가 만든 빈 원소를 떼어낸다.
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function countRecordFindings(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let inTable = false;
  const seen = new Set();
  for (const line of lines) {
    if (/^##\s+Findings\s*$/.test(line)) { inTable = true; continue; }
    if (inTable && /^##\s/.test(line)) break;
    if (!inTable) continue;
    if (!/^\|/.test(line)) continue;
    if (/^\|\s*Perspective\s*\|/i.test(line)) continue;   // 헤더
    if (/^\|[\s|:-]+\|$/.test(line)) continue;            // 구분선
    if (line.indexOf(SYNTHETIC_FAIL_CLAIM) !== -1) continue;
    const cells = parseRecordRow(line);
    const perspective = cells[0] || '';
    const severity = cells[1] || '';
    const claim = cells[2] || '';
    if (!perspective) continue;                           // emit 술어 (a)
    if (!claim) continue;                                 // emit 술어 (b)
    seen.add(perspective + '\0' + severity.toUpperCase() + '\0' +
      findingsRegistry.normalizeClaim(claim));            // 술어 (c) — fold
  }
  return seen.size;
}

// 패널 축만 추린다 (local review M4). `shard.findings` 는 그 work_unit 의 **모든**
// 게이트(패널 · Plan-Codex · santa)를 fold 한 집합이라, Codex·santa finding 이 있으면
// 좌변이 부풀어 **실제 패널 유실을 가린다** — 이 축이 겨냥한 것이 정확히 그 방향의
// 유실이므로 사각이 목적과 겹친다. 판별은 두 축이다: `gate_id` 가 패널 게이트이고
// `perspective` 가 Codex 축이 아닐 것(둘은 gate_id 를 공유하고 perspective 로 갈린다).
const PANEL_GATE_ID = 'mccp-plan-codex';
const CODEX_PERSPECTIVE = 'codex';

function panelFindingsOf(shard) {
  return (shard.findings || []).filter(function (f) {
    return f && f.gate_id === PANEL_GATE_ID && f.perspective !== CODEX_PERSPECTIVE;
  });
}

function listReviewRecords(repoRoot) {
  const dir = path.join(repoRoot, '.claude', 'reviews');
  let files;
  try { files = fs.readdirSync(dir); } catch (_e) { return []; }
  return files
    .filter(function (f) { return /^plan-review-.+\.md$/.test(f); })
    .map(function (f) {
      return {
        file: toPosix(path.join('.claude', 'reviews', f)),
        work_unit: f.replace(/^plan-review-/, '').replace(/\.md$/, ''),
        abs: path.join(dir, f),
      };
    });
}

// 표면(리뷰 기록)과 레지스트리를 파일시스템 결과로만 대조한다.
// 샤드가 아예 없는 기록은 `unmeasured` 다 — M7 이전의 기록이 트리에 남아 있는 것은
// 정상이고, 그것을 실패로 세면 게이트가 배송 증거와 저장소 일반 불변식을 뒤섞는다.
// 그 축은 `--acceptance` 가 milestone 범위에서 따로 강제한다.
function correlateStandingRecords(repoRoot) {
  const registry = findingsRegistry;
  const covered = [];
  const uncovered = [];
  const unmeasured = [];
  for (const rec of listReviewRecords(repoRoot)) {
    let markdown;
    try { markdown = fs.readFileSync(rec.abs, 'utf8'); } catch (_e) { continue; }
    const recordCount = countRecordFindings(markdown);
    if (recordCount === 0) continue;
    const shard = registry.readShard(rec.work_unit, { repoRoot: repoRoot });
    if (!shard.exists) {
      unmeasured.push({ file: rec.file, work_unit: rec.work_unit, record_findings: recordCount });
      continue;
    }
    const opened = panelFindingsOf(shard).length;
    if (opened < recordCount) {
      uncovered.push({
        file: rec.file, work_unit: rec.work_unit,
        record_findings: recordCount, registry_findings: opened,
      });
    } else {
      covered.push({ work_unit: rec.work_unit, record_findings: recordCount, registry_findings: opened });
    }
  }
  return {
    ok: uncovered.length === 0,
    covered: covered.length,
    uncovered: uncovered,
    unmeasured: unmeasured,
  };
}

// 창(window) 형태. 하니스가 사전·사후 스냅샷을 넘기면 그 delta 만 대조한다.
function snapshotReviewSurface(repoRoot) {
  const out = {};
  for (const rec of listReviewRecords(repoRoot)) {
    let stat;
    try { stat = fs.statSync(rec.abs); } catch (_e) { continue; }
    let count = 0;
    try { count = countRecordFindings(fs.readFileSync(rec.abs, 'utf8')); } catch (_e) { count = 0; }
    out[rec.file] = { work_unit: rec.work_unit, findings: count, mtime: stat.mtimeMs };
  }
  return out;
}

function correlateSurfaceDelta(repoRoot, before, after) {
  const registry = findingsRegistry;
  const uncovered = [];
  let deltas = 0;
  for (const file of Object.keys(after || {})) {
    const b = (before || {})[file] || null;
    const a = after[file];
    const added = a.findings - (b ? b.findings : 0);
    if (added <= 0) continue;
    deltas += 1;
    const shard = registry.readShard(a.work_unit, { repoRoot: repoRoot });
    const opened = panelFindingsOf(shard).length;
    if (opened < a.findings) {
      uncovered.push({
        file: file, work_unit: a.work_unit,
        record_findings: a.findings, registry_findings: opened,
      });
    }
  }
  return { ok: uncovered.length === 0, deltas: deltas, uncovered: uncovered };
}

// ── gate ─────────────────────────────────────────────────────────────────────
function evaluateGate(args) {
  args = args || {};
  const repoRoot = args.repoRoot || process.cwd();
  const failures = [];
  const axes = {};

  const lint = staticLint(repoRoot);
  axes.static_lint = lint;
  if (!lint.surface.ok) {
    failures.push({
      axis: 'static-lint-surface',
      reason: 'unapproved-finding-surface-writer',
      detail: lint.surface.violations.length + ' write(s) to .claude/reviews/ outside the '
        + 'approved writers — a finding surface that emits no registry event',
      violations: lint.surface.violations,
    });
  }
  if (!lint.registry.ok) {
    failures.push({
      axis: 'static-lint-registry',
      reason: 'unapproved-registry-writer',
      detail: lint.registry.violations.length + ' direct write(s) to .claude/state/findings/ '
        + 'outside findings-registry.js — the single normalization choke point is bypassed',
      violations: lint.registry.violations,
    });
  }

  const copresence = contractCoPresence(repoRoot);
  axes.contract_copresence = copresence;
  if (!copresence.ok) {
    failures.push({
      axis: 'contract-copresence',
      reason: 'split-landing',
      detail: copresence.detail,
    });
  }

  const merge = mergeUnionCheck(repoRoot);
  axes.merge_union = merge;
  if (!merge.ok) {
    failures.push({
      axis: 'merge-union',
      reason: 'append-log-merge-unsafe',
      detail: 'the registry glob does not resolve to merge=union — a parallel-worktree merge '
        + 'will silently drop one side of the append log',
      probes: merge.probes,
    });
  }

  const obs = args.runtimeObservation || null;
  if (obs && obs.before && obs.after) {
    const r = correlateSurfaceDelta(repoRoot, obs.before, obs.after);
    axes.runtime = Object.assign({ mode: 'windowed', supplied: true }, r);
    if (!r.ok) {
      failures.push({
        axis: 'runtime-surface-audit',
        reason: 'uncovered-surface-delta',
        detail: r.uncovered.length + ' review record(s) grew without matching registry events',
        uncovered: r.uncovered,
      });
    }
  } else {
    // 창을 만들 수 없을 때는 **현재 트리**를 대조한다 — 관측이 없다고 축을 비우면
    // 정적 lint 만으로 완결됐다고 주장하는 셈이 된다.
    const r = correlateStandingRecords(repoRoot);
    axes.runtime = Object.assign({ mode: 'standing', supplied: false }, r);
    if (!r.ok) {
      failures.push({
        axis: 'runtime-surface-audit',
        reason: 'record-exceeds-registry',
        detail: r.uncovered.length + ' review record(s) list more findings than the registry '
          + 'holds for that work unit — events were lost in the inflating direction',
        uncovered: r.uncovered,
      });
    }
  }

  return { ok: failures.length === 0, failures: failures, axes: axes };
}

// ── --acceptance ─────────────────────────────────────────────────────────────
//
// 이 milestone 의 수용 조건 중 **기계 판정 가능한 것**을 하나의 비영점-exit 명령으로
// 모은다. 수용 조건이 산문 체크리스트로만 있으면 건너뛰어도 PR 이 통과하므로
// "코드 존재는 판정 근거가 아니다"(UI4)를 스스로 위반한다.
//
// **opt-in 으로 분리하는 것은 정직성 요구다**: 레지스트리 파일 실재를 default 모드에서
// 요구하면 아직 패널을 한 번도 돌리지 않은 fresh clone 에서 게이트가 붉어져, 저장소
// 일반 불변식과 이 milestone 의 배송 증거가 뒤섞인다.
// **plan 이 예측한 이름과 실측이 다르다 — 실측을 쓴다.** plan 의 Acceptance 는
// `multi-session-work-loop.jsonl` 을 지목하며 그 근거로 `derive-decision --command
// mccp:plan --args <PRD 경로>` 가 PRD 기준 slug 를 낸다는 실측을 들었다. 그러나 이
// 사이클의 패널은 milestone 단위로 재발행돼(santa-evidence-diversity M2 선례와 같은
// 형태) 실제 게이트 slug 이 `-m7` 을 달았고, receipt 파일명
// (`mccp-plan-codex/multi-session-work-loop-m7.json`)과 리뷰 기록 파일명이 그것을
// 확증한다. 수용 조건의 **실질**은 "라이브 배선이 커밋된 이벤트를 남겼는가"이므로
// 그 실질을 지키고 이름만 실측에 맞춘다. `--work-unit` 으로 재지정 가능하다.
const ACCEPTANCE_WORK_UNIT = 'multi-session-work-loop-m7';
const AUDIT_SAMPLE_PATH = 'docs/multi-session-work-loop/m7-audit-sample.json';

function evaluateAcceptance(args) {
  args = args || {};
  const repoRoot = args.repoRoot || process.cwd();
  const workUnit = args.workUnit || ACCEPTANCE_WORK_UNIT;
  const rel = '.claude/state/findings/' + workUnit + '.jsonl';
  const failures = [];
  const axes = {};

  // 축 1 — 레지스트리 파일 실재 (배선이 실제로 돌았는가. unit test green 이 이것을
  // 대신하지 못한다).
  let exists = false;
  let size = 0;
  try { const st = fs.statSync(path.join(repoRoot, rel)); exists = st.isFile(); size = st.size; }
  catch (_e) { exists = false; }
  axes.registry_present = { ok: exists && size > 0, path: rel, bytes: size };
  if (!axes.registry_present.ok) {
    failures.push({ axis: 'registry-present', detail: rel + ' is absent or empty — the live '
      + 'gate path never wrote a finding event' });
  }

  // 축 2 — **HEAD 커밋 실재**. `git ls-files --error-unmatch` 는 index 등재만 증명하고
  // commit 을 증명하지 않는다(실측: `git add` 직후 통과). 문언이 요구하는 것은 커밋이다.
  let committed = false;
  let commitDetail = null;
  try {
    execFileSync('git', ['cat-file', '-e', 'HEAD:' + rel], { cwd: repoRoot, stdio: 'pipe' });
    committed = true;
  } catch (err) {
    committed = false;
    commitDetail = (err && err.message) ? String(err.message).split('\n')[0] : 'not in HEAD';
  }
  axes.registry_committed = { ok: committed, path: rel, detail: commitDetail };
  if (!committed) {
    failures.push({ axis: 'registry-committed', detail: rel + ' is not reachable in the HEAD '
      + 'tree — evidence that survives worktree cleanup is the whole point (DD4)' });
  }

  // 축 3 — merge=union 적용.
  const merge = mergeUnionCheck(repoRoot);
  axes.merge_union = merge;
  if (!merge.ok) {
    failures.push({ axis: 'merge-union', detail: 'the registry glob does not resolve to union' });
  }

  // 축 4 — C1 이 computed ∧ numerator/denominator non-null ∧ coverage 가 degraded 아님.
  // degraded 는 지표 산출을 막지 않지만(Task 2) **배송 증거로는 쓰지 않는다**. 두 층을
  // 분리하지 않으면 둘 중 하나가 반드시 틀린다.
  let c1 = null;
  try {
    const { derive } = require(path.join(repoRoot, 'plugins', 'mccp', 'scripts', 'derive', 'index.js'));
    const model = derive(repoRoot, { raw: true });
    c1 = model && model.metrics ? model.metrics.C1 : null;
  } catch (err) {
    c1 = null;
    axes.c1_error = String((err && err.message) || err);
  }
  const c1Ok = !!c1 && c1.status === 'computed'
    && c1.numerator !== null && c1.numerator !== undefined
    && c1.denominator !== null && c1.denominator !== undefined
    && typeof c1.coverage === 'string' && c1.coverage.indexOf('degraded') === -1;
  axes.c1_computed = {
    ok: c1Ok,
    status: c1 ? c1.status : null,
    numerator: c1 ? c1.numerator : null,
    denominator: c1 ? c1.denominator : null,
    coverage: c1 ? c1.coverage : null,
  };
  if (!c1Ok) {
    failures.push({ axis: 'c1-computed', detail: 'C1 is not a clean computed value '
      + '(status=' + (c1 ? c1.status : 'absent') + ' coverage=' + (c1 ? c1.coverage : 'n/a')
      + ') — code existing is not a completion criterion (UI4)' });
  }

  // 축 5 — UI11 감사 표본 대조. 5건이 전부 `matches:true` 이고 그 분모가 라이브 산출과 일치.
  let sample = null;
  try { sample = JSON.parse(fs.readFileSync(path.join(repoRoot, AUDIT_SAMPLE_PATH), 'utf8')); }
  catch (_e) { sample = null; }
  const samples = (sample && Array.isArray(sample.samples)) ? sample.samples : [];
  const mismatched = samples.filter(function (s) { return s.matches !== true; });
  const denominatorAgrees = !!sample && !!c1 && sample.computed_denominator === c1.denominator;
  const sampleOk = samples.length >= 5 && mismatched.length === 0 && denominatorAgrees;
  axes.audit_sample = {
    ok: sampleOk,
    path: AUDIT_SAMPLE_PATH,
    samples: samples.length,
    mismatched: mismatched.length,
    recorded_denominator: sample ? sample.computed_denominator : null,
    live_denominator: c1 ? c1.denominator : null,
  };
  if (!sampleOk) {
    failures.push({ axis: 'audit-sample', detail: 'the UI11 audit sample is absent, short of 5 '
      + 'entries, has a mismatch, or its denominator disagrees with the live computation' });
  }

  return { ok: failures.length === 0, mode: 'acceptance', failures: failures, axes: axes };
}

function runCli(argv) {
  const repoRoot = process.cwd();
  const acceptance = argv.indexOf('--acceptance') !== -1;
  const wuIdx = argv.indexOf('--work-unit');
  const workUnit = (wuIdx !== -1 && argv[wuIdx + 1]) ? argv[wuIdx + 1] : undefined;
  const result = acceptance
    ? evaluateAcceptance({ repoRoot: repoRoot, workUnit: workUnit })
    : evaluateGate({ repoRoot: repoRoot });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) {
    (result.failures || []).forEach(function (f) {
      process.stderr.write('[c1-coverage-gate] FAIL ' + f.axis + ': ' + (f.detail || f.reason) + '\n');
    });
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  evaluateGate: evaluateGate,
  evaluateAcceptance: evaluateAcceptance,
  staticLint: staticLint,
  lintSurface: lintSurface,
  contractCoPresence: contractCoPresence,
  mergeUnionCheck: mergeUnionCheck,
  countRecordFindings: countRecordFindings,
  parseRecordRow: parseRecordRow,
  panelFindingsOf: panelFindingsOf,
  PANEL_GATE_ID: PANEL_GATE_ID,
  CODEX_PERSPECTIVE: CODEX_PERSPECTIVE,
  listReviewRecords: listReviewRecords,
  correlateStandingRecords: correlateStandingRecords,
  correlateSurfaceDelta: correlateSurfaceDelta,
  snapshotReviewSurface: snapshotReviewSurface,
  runCli: runCli,
  APPROVED_SURFACE_WRITERS: APPROVED_SURFACE_WRITERS,
  APPROVED_REGISTRY_WRITERS: APPROVED_REGISTRY_WRITERS,
  SELF_EXEMPT: SELF_EXEMPT,
  SURFACE_PATH_TOKEN_RE: SURFACE_PATH_TOKEN_RE,
  REGISTRY_PATH_TOKEN_RE: REGISTRY_PATH_TOKEN_RE,
  ACCEPTANCE_WORK_UNIT: ACCEPTANCE_WORK_UNIT,
  AUDIT_SAMPLE_PATH: AUDIT_SAMPLE_PATH,
};
