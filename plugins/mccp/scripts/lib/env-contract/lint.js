'use strict';

// env-contract/lint.js — 레지스트리 · 런타임 스캔 · 색인 표의 삼각 정합 검사 (v1.29.1).
//
// 9개 검사는 전부 fail-closed다. 읽기 실패는 «통과»가 아니라 drift로 보고한다 —
// `state/toggle-snapshot.js:184` `crossCheckExclusions`가 확립한 규약이고, 그 반대
// (읽을 수 없으면 조용히 넘어감)는 문서가 낡았는지 아는 유일한 장치를 꺼 버린다.
//
//   L1  런타임 스캔이 레지스트리의 부분집합인가 (미등재 0)
//   L2  레지스트리와 색인 표가 양방향으로 같은가 (이름 · kind · values · default)
//   L3  색인의 `상세` 링크가 파일과 **앵커까지** 해석되는가
//   L4  은퇴 이름이 런타임 표면에 부재한가
//   L5  실재하는 토글에 stale 상태 마커가 붙어 있지 않은가
//   L6  명시 제외 분류표가 규범 문서와 어긋나지 않는가 (crossCheckExclusions 위임)
//   L7  사용 예시 3검사 — 존재 · JSON.parse 실행 · 레지스트리 values 정합
//   L8  evidence의 형식과 실재 — **어휘 검사를 fs 호출보다 먼저**
//   L9  등록된 boolean 토글의 raw 비교가 `env-contract/` 밖에 0건인가
//   L10 evidence가 **실제로 그 이름을 가리키는가** (+ `not-consumed` 역방향 + 래칫)
//
// **L10이 L8과 다른 질문을 한다.** L8은 형식과 실재만 본다 — 파일이 있고 행이 범위
// 안이면 통과이므로, 무관한 줄을 가리켜도 `ok`다(실측 M5: `impeccable-detect.js:135`를
// 19번 적은 항목들이 전부 L8을 통과했고 그 줄은 `isDesignSurfacePath()` 내부였다).
// 판정 자체는 `evidence-name.js`가 순수 함수로 소유하고 이 파일은 fs와 범위만 대며,
// 그 분리가 fixture registry로 래칫 양방향을 단위 test할 수 있게 하는 유일한 지점이다.
//
// **L8의 순서는 load-bearing이다.** 실재를 먼저 보면 디스크에 존재하는 절대경로가
// 통과해 CLAUDE.md §3.12가 닫은 누출 경로가 다시 열린다. `lib/instruction-contract/lint.js:41`이
// "어휘 스크린을 fs 호출보다 먼저"를 같은 이유로 배치한다.
//
// **L9의 스캔 범위는 Acceptance 주장의 범위와 같다.** 파일 열거는 `scan.js#walkSurfaces`가
// 소유하며 이 파일은 자체 walk를 갖지 않는다 — 범위가 갈라지면 "raw 비교 0건"이라는
// 주장이 검사 범위 밖에서 조용히 거짓이 된다.
//
// **L9가 잡는 것과 못 잡는 것.** 세 형태를 본다: 직접 비교(`process.env.X === '1'`),
// load-time 별칭 포획(`const E = process.env.X;` … `E === '1'`), 구조분해
// (`const { X } = process.env;` … `X === '1'`). 별칭 해석은 **파일 안에서 1단계**만
// 따라간다 — 완전한 data-flow 분석이 아니다. 다단 별칭이나 파일을 넘는 전달은 보지
// 못하며, 이 한계를 여기 적어 두는 것이 "0건"이라는 보고를 정직하게 만든다.

const fs = require('fs');
const path = require('path');

const registry = require('./registry');
const scan = require('./scan');
const evidenceName = require('./evidence-name');

// v1.32.1 M6 — L10 **역방향**(status=not-consumed 이름이 런타임 표면에 나타나면 그 주장이
// 거짓이다) 전용 표면 정책. `scan.walkSurfaces`는 env-contract/ 전체를 제외하는데(그
// 디렉토리가 raw 비교의 정당한 자리이므로 L1·L9에는 맞는 제외다) 그 결과 역방향이 자기
// 구현 디렉토리를 보지 못하는 사각지대가 생긴다.
//
// **근거를 실측대로 적는다.** plan은 `value.js`를 «이 디렉토리에서 유일하게 런타임에 env를
// 읽는 파일»이라 불렀는데, 문자 그대로는 참이 아니다 — 실측하면 이 디렉토리의 어느 파일도
// `process.env`를 직접 읽지 않고(그 이름이 등장하는 3곳은 전부 **주석**이다), `value.js`는
// 호출자가 건네는 `env` 객체를 **해석하는 계층**이다. 포함시키는 진짜 이유는 그것이다:
// mccp가 언젠가 `IMPECCABLE_*`를 실제로 소비하기 시작하면 그 이름이 **리터럴로 처음 나타날**
// 자리가 값 해석 계층이고, 그 순간 «mccp는 읽지 않는다»가 거짓이 된다. 오늘 그 파일의
// `IMPECCABLE_` 리터럴은 0건이라 위양성 없이 들어온다.
//
// 나머지는 **이름으로 열거하고 각각 사유를 적는다** — mirror: `state/toggle-snapshot.js`의
// `TOGGLE_EXCLUSIONS`(제외는 정규식이 아니라 이름이고, 각 이름에 실파일 근거가 붙는다).
// 이 표는 장식이 아니라 강제된다: 아래 L10이 디렉토리를 열거해 **분류되지 않은 새 파일**을
// problem으로 보고하므로, 미래에 여기 파일이 생기면 침묵으로 넘어가지 못한다.
const L10_REVERSE_SURFACE_POLICY = Object.freeze([
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/value.js', include: true,
    why: '값 해석 계층 — IMPECCABLE_* 이름이 리터럴로 처음 나타날 자리다(오늘 0건).',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/registry.js', include: false,
    why: '계약 표 자체 — 모든 토글 이름이 데이터로 실려 있어 포함하면 전 not-consumed 이름이 즉시 위양성이 된다.',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/lint.js', include: false,
    why: '검사기 자신 — 이 정책 표와 problem 메시지가 이름을 인용하므로 같은 위양성을 낳는다.',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/evidence-name.js', include: false,
    why: '판정 코어 — 이름을 인자로 받아 메시지에 싣는다. 소비가 아니라 판정이다.',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/evidence-debt.js', include: false,
    why: '면제 목록 — 이름이 데이터로 실려 있다. 포함하면 목록에 오른 이름이 자기 때문에 붉어진다.',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/measure-evidence.js', include: false,
    why: '계측기 — registry를 읽어 이름을 다루기만 하고 토글로 소비하지 않는다.',
  }),
  Object.freeze({
    rel: 'plugins/mccp/scripts/lib/env-contract/scan.js', include: false,
    why: '파일 열거기 — env 값을 해석하지 않으므로 런타임 표면이 아니다.',
  }),
]);
const ENV_CONTRACT_DIR_REL = 'plugins/mccp/scripts/lib/env-contract';

const INDEX_REL = 'docs/ENVIRONMENT.md';
const DETAIL_DIR_REL = 'docs/environment';
// 은퇴 항목에 사용법을 다는 것은 모순이므로 L7에서 제외한다.
const EXAMPLE_EXEMPT = 'retired.md';

const STALE_MARKER_RE = /\u{1F6A7}\s*(미구현|예정)/gu;

function readFile(abs) {
  try {
    return { ok: true, text: fs.readFileSync(abs, 'utf8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function fail(check, messages) {
  return { ok: messages.length === 0, check: check, problems: messages };
}

// ── 색인 파싱 ────────────────────────────────────────────────────────────────
// 행 형식은 6열 고정이다: `| \`NAME\` | kind | values | default | summary | [→](link) |`
// 셀 안에 리터럴 `|`를 쓰지 않는다 — 열 수 검사가 split('|')이라 이스케이프해도 세어진다.
const ROW_RE = /^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/;
const LINK_RE = /\(([^()\s]+)\)/;

const NULL_CELL = '—';
const EMPTY_CELL = '(빈 값)';

function renderValues(entry) {
  return entry.values ? entry.values.join('/') : NULL_CELL;
}

function renderDefault(entry) {
  if (entry.default === null) return NULL_CELL;
  if (entry.default === '') return EMPTY_CELL;
  return entry.default;
}

function parseIndex(text) {
  const rows = new Map();
  const dupes = [];
  text.split(/\r?\n/).forEach(function (line, i) {
    const m = ROW_RE.exec(line);
    if (!m) return;
    const name = m[1];
    const row = {
      name: name,
      kind: m[2].trim(),
      values: m[3].trim(),
      def: m[4].trim(),
      summary: m[5].trim(),
      link: m[6].trim(),
      line: i + 1,
    };
    if (rows.has(name)) dupes.push(name + ' (lines ' + rows.get(name).line + ' and ' + row.line + ')');
    else rows.set(name, row);
  });
  return { rows: rows, dupes: dupes };
}

// GitHub 앵커 규칙의 축약: 소문자화 · 영숫자/공백/하이픈/밑줄만 남김 · 공백을 하이픈으로.
function anchorize(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function collectAnchors(text) {
  const set = new Set();
  text.split(/\r?\n/).forEach(function (line) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) set.add(anchorize(m[2]));
  });
  return set;
}

// ── L8 어휘 스크린 ───────────────────────────────────────────────────────────
// fs를 부르기 **전에** 돈다. 순서가 뒤집히면 디스크에 존재하는 절대경로가 통과한다.
function evidenceLexicalProblem(evidence) {
  if (typeof evidence !== 'string' || evidence.trim() === '') return 'empty evidence';
  const raw = evidence.trim();
  const m = /^(.*):(\d+)$/.exec(raw);
  if (!m) return 'evidence must be "path:line", got "' + raw + '"';
  const p = m[1];
  if (p === '') return 'evidence path is empty';
  if (p.indexOf('\u0000') !== -1) return 'evidence path contains a NUL byte';
  if (/^[\/\\]/.test(p)) return 'absolute path (POSIX root) not allowed: ' + p;
  if (/^[A-Za-z]:/.test(p)) return 'absolute path (drive letter) not allowed: ' + p;
  if (/^\\\\/.test(p)) return 'absolute path (UNC) not allowed: ' + p;
  if (/^~[\/\\]?/.test(p)) return 'home-relative path not allowed: ' + p;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) return 'URL not allowed: ' + p;
  if (/%[A-Za-z_]+%|\$\{?[A-Za-z_]/.test(p)) return 'environment-expanded path not allowed: ' + p;
  if (p.split(/[\/\\]/).indexOf('..') !== -1) return 'parent traversal ".." not allowed: ' + p;
  return null;
}

// ── L9 raw 비교 탐지 ─────────────────────────────────────────────────────────
const COMPARE_RE = /(===|!==|==|!=)\s*['"][^'"]*['"]/;

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function rawComparisonHits(text, boolNames) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  // 1단계 별칭 표: 별칭 → 토글 이름.
  const aliases = new Map();
  lines.forEach(function (line) {
    if (isCommentLine(line)) return;
    boolNames.forEach(function (n) {
      if (line.indexOf(n) === -1) return;
      const direct = new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:process\\.)?env\\s*(?:\\.\\s*' + n + '\\b|\\[\\s*[\'"]' + n + '[\'"]\\s*\\])');
      const destr = new RegExp('(?:const|let|var)\\s*\\{[^}]*\\b' + n + '\\b[^}]*\\}\\s*=\\s*(?:process\\.)?env\\b');
      const dm = direct.exec(line);
      if (dm) aliases.set(dm[1], n);
      if (destr.test(line)) aliases.set(n, n);
    });
  });

  lines.forEach(function (line, i) {
    if (isCommentLine(line)) return;
    if (!COMPARE_RE.test(line)) return;
    boolNames.forEach(function (n) {
      if (line.indexOf(n) === -1) return;
      const access = new RegExp('(?:process\\.)?env\\s*(?:\\.\\s*' + n + '\\b|\\[\\s*[\'"]' + n + '[\'"]\\s*\\])');
      if (access.test(line)) hits.push({ line: i + 1, name: n, form: 'direct', text: line.trim().slice(0, 120) });
    });
    aliases.forEach(function (toggle, alias) {
      const use = new RegExp('\\b' + alias.replace(/\$/g, '\\$') + '\\b\\s*(===|!==|==|!=)\\s*[\'"]');
      if (use.test(line)) {
        hits.push({ line: i + 1, name: toggle, form: alias === toggle ? 'destructured' : 'alias:' + alias, text: line.trim().slice(0, 120) });
      }
    });
  });
  // 같은 줄이 두 형태로 잡히면 하나로 접는다.
  const seen = new Set();
  return hits.filter(function (h) {
    const k = h.line + '|' + h.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── run ──────────────────────────────────────────────────────────────────────
function run(repoRoot) {
  const root = repoRoot || process.cwd();
  const checks = {};
  const entries = registry.ENTRIES;
  const byName = new Map();
  entries.forEach(function (e) { byName.set(e.name, e); });

  // L1 — 런타임 스캔 ⊆ 레지스트리
  {
    const problems = [];
    let toggles = [];
    try {
      const ts = require(path.join(root, 'plugins/mccp/scripts/state/toggle-snapshot.js'));
      toggles = ts.scanSurfaceDetailed(root).toggles;
      if (!toggles.length) problems.push('runtime scan produced 0 toggles — the check would pass vacuously');
    } catch (e) {
      problems.push('could not run the runtime scan (read failure is drift, not a pass): ' + e.message);
    }
    toggles.forEach(function (n) {
      if (!byName.has(n)) problems.push('runtime toggle not in registry: ' + n);
    });
    checks.L1 = fail('registry covers the runtime surface', problems);
  }

  // L2 — 레지스트리 ↔ 색인 양방향
  const indexRead = readFile(path.join(root, INDEX_REL));
  let index = { rows: new Map(), dupes: [] };
  {
    const problems = [];
    if (!indexRead.ok) {
      problems.push('cannot read ' + INDEX_REL + ': ' + indexRead.error);
    } else {
      index = parseIndex(indexRead.text);
      index.dupes.forEach(function (d) { problems.push('duplicate index row: ' + d); });
      entries.forEach(function (e) {
        const row = index.rows.get(e.name);
        if (!row) { problems.push('registry entry missing from the index: ' + e.name); return; }
        if (row.kind !== e.kind) problems.push(e.name + ': index kind "' + row.kind + '" != registry "' + e.kind + '"');
        const wantValues = renderValues(e);
        if (row.values !== wantValues) problems.push(e.name + ': index values "' + row.values + '" != registry "' + wantValues + '"');
        const wantDefault = renderDefault(e);
        if (row.def !== wantDefault) problems.push(e.name + ': index default "' + row.def + '" != registry "' + wantDefault + '"');
      });
      index.rows.forEach(function (row, name) {
        if (!byName.has(name)) problems.push('index row not in registry: ' + name);
      });
      if (index.rows.size === 0) problems.push('index has 0 parsable toggle rows — the bidirectional check would pass vacuously');
    }
    checks.L2 = fail('index and registry agree both ways', problems);
  }

  // L3 — 색인 링크가 파일과 앵커까지 해석
  {
    const problems = [];
    const anchorCache = new Map();
    if (index.rows.size === 0) {
      problems.push('no index rows to resolve — cannot certify link resolution');
    }
    index.rows.forEach(function (row, name) {
      const lm = LINK_RE.exec(row.link);
      if (!lm) { problems.push(name + ': 상세 cell has no markdown link'); return; }
      const target = lm[1];
      const hashAt = target.indexOf('#');
      if (hashAt === -1) { problems.push(name + ': 상세 link has no anchor fragment (' + target + ')'); return; }
      const rel = target.slice(0, hashAt);
      const frag = target.slice(hashAt + 1);
      const abs = path.join(root, 'docs', rel);
      if (!anchorCache.has(rel)) {
        const r = readFile(abs);
        anchorCache.set(rel, r.ok ? collectAnchors(r.text) : null);
      }
      const anchors = anchorCache.get(rel);
      if (!anchors) { problems.push(name + ': 상세 link target does not exist: docs/' + rel); return; }
      if (!anchors.has(frag)) problems.push(name + ': anchor #' + frag + ' not found in docs/' + rel);
      const entry = byName.get(name);
      if (entry && target !== entry.doc) {
        problems.push(name + ': 상세 link "' + target + '" != registry doc "' + entry.doc + '"');
      }
    });
    checks.L3 = fail('index detail links resolve to file and anchor', problems);
  }

  // L4 — 은퇴 이름이 런타임 표면에 부재
  {
    const problems = [];
    const retired = entries.filter(function (e) { return e.status === 'retired'; }).map(function (e) { return e.name; });
    if (retired.length === 0) problems.push('no retired entries — the absence check would pass vacuously');
    const files = scan.walkSurfaces(root);
    if (files.length === 0) problems.push('walkSurfaces yielded no files — the absence check would pass vacuously');
    files.forEach(function (rel) {
      const r = readFile(path.join(root, rel));
      if (!r.ok) { problems.push('cannot read ' + rel + ': ' + r.error); return; }
      retired.forEach(function (n) {
        if (r.text.indexOf(n) !== -1) problems.push('retired toggle ' + n + ' still appears on the runtime surface: ' + rel);
      });
    });
    checks.L4 = fail('retired names are absent from the runtime surface', problems);
  }

  // L5 — 실재하는 토글에 stale 상태 마커 0건
  {
    const problems = [];
    const targets = [INDEX_REL];
    let detail = [];
    try {
      detail = fs.readdirSync(path.join(root, DETAIL_DIR_REL))
        .filter(function (f) { return f.endsWith('.md'); })
        .map(function (f) { return DETAIL_DIR_REL + '/' + f; });
    } catch (e) {
      problems.push('cannot list ' + DETAIL_DIR_REL + ': ' + e.message);
    }
    if (detail.length === 0) problems.push('no detail docs found — the stale-marker check would pass vacuously');
    targets.concat(detail).forEach(function (rel) {
      const r = readFile(path.join(root, rel));
      if (!r.ok) { problems.push('cannot read ' + rel + ': ' + r.error); return; }
      const found = r.text.match(STALE_MARKER_RE);
      if (found) problems.push(rel + ': ' + found.length + ' stale status marker(s) — ' + found.join(', '));
    });
    checks.L5 = fail('no stale status markers on shipped surfaces', problems);
  }

  // L6 — 명시 제외 분류표 대조 (위임)
  {
    const problems = [];
    try {
      const ts = require(path.join(root, 'plugins/mccp/scripts/state/toggle-snapshot.js'));
      const x = ts.crossCheckExclusions(root);
      if (!x || typeof x !== 'object') {
        problems.push('crossCheckExclusions returned nothing — read failure is drift, not a pass');
      } else if (Array.isArray(x.drift) && x.drift.length) {
        x.drift.forEach(function (d) { problems.push('exclusion drift: ' + (typeof d === 'string' ? d : JSON.stringify(d))); });
      }
    } catch (e) {
      problems.push('crossCheckExclusions threw: ' + e.message);
    }
    checks.L6 = fail('exclusion table matches its normative doc', problems);
  }

  // L7 — 사용 예시 3검사
  {
    const problems = [];
    let files = [];
    try {
      files = fs.readdirSync(path.join(root, DETAIL_DIR_REL))
        .filter(function (f) { return f.endsWith('.md') && f !== EXAMPLE_EXEMPT; });
    } catch (e) {
      problems.push('cannot list ' + DETAIL_DIR_REL + ': ' + e.message);
    }
    let anchors = 0;
    files.forEach(function (f) {
      const r = readFile(path.join(root, DETAIL_DIR_REL, f));
      if (!r.ok) { problems.push('cannot read ' + f + ': ' + r.error); return; }
      r.text.split(/\n(?=### )/).forEach(function (sec) {
        const hm = /^### ([A-Z][A-Z0-9_]*)/.exec(sec);
        if (!hm) return;
        const name = hm[1];
        anchors++;
        if (!/\*\*사용 예시/.test(sec)) { problems.push(f + '#' + name + ': no 사용 예시 block'); return; }
        const blocks = [];
        const re = /```(json|bash)\r?\n([\s\S]*?)```/g;
        let m;
        while ((m = re.exec(sec)) !== null) blocks.push({ lang: m[1], body: m[2] });
        if (blocks.length === 0) { problems.push(f + '#' + name + ': no json/bash fence under 사용 예시'); return; }
        blocks.forEach(function (b) {
          if (b.lang !== 'json') return;
          let parsed = null;
          try {
            parsed = JSON.parse(b.body);
          } catch (e) {
            problems.push(f + '#' + name + ': JSON.parse failed — ' + e.message);
            return;
          }
          const env = (parsed && parsed.env) || parsed || {};
          if (!Object.prototype.hasOwnProperty.call(env, name)) return;
          const val = env[name];
          if (typeof val !== 'string') {
            problems.push(f + '#' + name + ': example value is not a string (settings.json env values are strings)');
            return;
          }
          const entry = byName.get(name);
          if (entry && Array.isArray(entry.values) && entry.values.length && entry.values.indexOf(val) === -1) {
            problems.push(f + '#' + name + ': example value "' + val + '" not in registry values [' + entry.values.join('|') + ']');
          }
        });
      });
    });
    if (anchors === 0) problems.push('no toggle anchors under ' + DETAIL_DIR_REL + ' — the example check would pass vacuously');
    checks.L7 = fail('every non-retired toggle anchor carries a valid usage example', problems);
    checks.L7.anchors = anchors;
  }

  // L8 — evidence 형식(어휘 먼저) + 실재
  {
    const problems = [];
    if (entries.length === 0) problems.push('registry is empty — the evidence check would pass vacuously');
    entries.forEach(function (e) {
      // 어휘 스크린이 먼저다. 통과하지 못하면 fs를 부르지 않는다.
      const lex = evidenceLexicalProblem(e.evidence);
      if (lex) { problems.push(e.name + ': ' + lex); return; }
      const m = /^(.*):(\d+)$/.exec(e.evidence.trim());
      const rel = m[1];
      const lineNo = Number.parseInt(m[2], 10);
      const r = readFile(path.join(root, rel));
      if (!r.ok) { problems.push(e.name + ': evidence path does not exist: ' + rel); return; }
      const total = r.text.split(/\r?\n/).length;
      if (lineNo < 1 || lineNo > total) {
        problems.push(e.name + ': evidence line ' + lineNo + ' is out of range for ' + rel + ' (' + total + ' lines)');
      }
    });
    checks.L8 = fail('registry evidence is repo-relative and real', problems);
  }

  // L9 — raw 비교 0건
  {
    const problems = [];
    const boolNames = registry.byKind('bool').concat(registry.byKind('bypass-flag')).map(function (e) { return e.name; });
    if (boolNames.length === 0) problems.push('no boolean entries — the raw-comparison check would pass vacuously');
    const files = scan.walkSurfaces(root);
    if (files.length === 0) problems.push('walkSurfaces yielded no files — the raw-comparison check would pass vacuously');
    files.forEach(function (rel) {
      const r = readFile(path.join(root, rel));
      if (!r.ok) { problems.push('cannot read ' + rel + ': ' + r.error); return; }
      rawComparisonHits(r.text, boolNames).forEach(function (h) {
        problems.push(rel + ':' + h.line + ' [' + h.form + '] ' + h.name + ' — ' + h.text);
      });
    });
    checks.L9 = fail('no raw boolean comparisons outside env-contract/', problems);
    checks.L9.filesScanned = files.length;
  }

  // L10 — evidence가 실제로 그 이름을 가리키는가 (+ not-consumed 역방향 + 래칫)
  {
    // 래칫 로더는 fail-closed다. 모듈이 없거나 throw하거나 모양이 틀리면 면제 집합이
    // **빈 집합**이 되고 정방향 검사가 전부 그대로 판정된다 — 관대한 방향으로 실패하면
    // 목록이 조용히 «전체 면제»가 된다(Implement-Codex R1 F1). `assertShape`를 로드
    // 성공 뒤에 한 번 더 부르는 것은 모듈이 자기 검증을 지운 채로 배포되는 경우까지
    // lint 쪽에서 잡기 위해서다.
    // 목록은 **이 모듈 옆**에서 읽는다 — `root` 밑이 아니다. `run()`이 이미 registry를
    // 그렇게 쓰고 있고(`entries = registry.ENTRIES`), 둘은 같은 선언 집합을 설명하므로
    // 출처가 갈리면 fixture repo에서 «남의 registry를 이 repo의 목록으로 판정»하게 된다.
    let debt = null;
    let debtError = null;
    try {
      const mod = require('./evidence-debt');
      debt = mod.EVIDENCE_DEBT;
      mod.assertShape(debt);
    } catch (e) {
      debt = null;
      debtError = e.message;
    }

    const lineCache = new Map();
    const readLines = function (rel) {
      if (!lineCache.has(rel)) {
        const r = readFile(path.join(root, rel));
        lineCache.set(rel, r.ok ? r.text.split(/\r?\n/) : null);
      }
      return lineCache.get(rel);
    };

    const problemsExtra = [];

    // 범위는 `scan.walkSurfaces`가 소유한다 — 자체 walk를 갖지 않는 L4·L9와 같은 계약.
    const surfaces = [];
    scan.walkSurfaces(root).forEach(function (rel) {
      const r = readFile(path.join(root, rel));
      if (r.ok) surfaces.push({ rel: rel, text: r.text });
    });

    // v1.32.1 M6 — 역방향에만 더한다. L1(:283)·L9(:413)의 입력은 **바꾸지 않는다**: 그들의
    // 범위를 넓히면 이 milestone이 검증하지 않은 축이 붉어진다. surfaces는
    // `evidence-name.js`의 not-consumed 분기에서만 소비되므로(그 파일의 역방향 루프가
    // 유일한 독자다) 이 추가는 정방향 판정에 도달하지 않는다.
    //
    // **디렉토리 부재는 problem이 아니다.** 이 정책의 대상은 *이 저장소의 구현 디렉토리*이고,
    // 그것이 없는 root(합성 fixture · 이 계약을 벤더링하지 않은 저장소)에는 인증할 env-contract
    // 파일이 애초에 없다. 그런 root에서 옳은 동작은 M6 이전과 같다 — walkSurfaces가 준 표면만
    // 쓴다. 부재를 붉히면 «대상이 없다»를 «검사에 실패했다»로 보고하게 되고, 그 거짓 신호가
    // 다른 검사의 fixture까지 오염시킨다(실측: lint.test.js의 «이 검사만 붉다» 단언이 전부
    // 무너졌다). 디렉토리가 **있는데** 선언된 파일이 안 읽히거나 미분류 파일이 있으면 그때는
    // 진짜 드리프트이므로 problem이다.
    const classified = new Set(L10_REVERSE_SURFACE_POLICY.map(function (p) { return p.rel; }));
    let dirEntries = null;
    try {
      dirEntries = fs.readdirSync(path.join(root, ENV_CONTRACT_DIR_REL), { withFileTypes: true });
    } catch (_) {
      dirEntries = null;
    }
    if (dirEntries) {
      L10_REVERSE_SURFACE_POLICY.filter(function (p) { return p.include; }).forEach(function (p) {
        const r = readFile(path.join(root, p.rel));
        if (r.ok) surfaces.push({ rel: p.rel, text: r.text });
        else problemsExtra.push('L10 reverse surface ' + p.rel + ' is declared but unreadable — '
          + 'absence cannot be certified against a file that was not read');
      });

      // 표가 화석이 되지 않게 한다: 이 디렉토리에 분류되지 않은 .js가 생기면 침묵이 아니라
      // problem이다. 그것이 «미래의 조용한 면제를 막는다»는 이 태스크의 유일한 실질이다.
      const onDisk = new Set();
      dirEntries.forEach(function (e) {
        if (!e.isFile() || !/\.js$/.test(e.name)) return;
        const rel = ENV_CONTRACT_DIR_REL + '/' + e.name;
        onDisk.add(rel);
        if (!classified.has(rel)) {
          problemsExtra.push(rel + ': new file in env-contract/ is not classified in '
            + 'L10_REVERSE_SURFACE_POLICY — declare include:true (it interprets env values) or '
            + 'include:false with a reason');
        }
      });

      // v1.32.1 code-review L1 — 화석 방지는 **양방향**이어야 한다. 위 루프는 새 파일만
      // 잡는다: 표에 열거된 `include:false` 파일은 읽지 않으므로 디스크에서 사라져도
      // 아무것도 붉지 않고, 표는 존재하지 않는 파일에 사유를 다는 문서로 남는다. 그것은
      // 이 milestone이 `EVIDENCE_DEBT`에서 지적한 비대칭(«고쳐졌는데 목록에 남는다»)과
      // 같은 형태다. `include:true` 항목은 위에서 읽기 실패로 이미 붉으므로 여기서는
      // 중복을 피해 나머지만 본다.
      L10_REVERSE_SURFACE_POLICY.forEach(function (p) {
        if (p.include) return;
        if (!onDisk.has(p.rel)) {
          problemsExtra.push(p.rel + ': listed in L10_REVERSE_SURFACE_POLICY but absent from '
            + 'env-contract/ — delete the row (the table only describes files that exist)');
        }
      });
    }

    const problems = problemsExtra.concat(evidenceName.evidenceNameProblems({
      entries: entries,
      debt: debt,
      debtError: debtError,
      readLines: readLines,
      surfaces: surfaces,
      lexicalProblem: evidenceLexicalProblem,
    }));
    checks.L10 = fail('registry evidence names the toggle it points at', problems);
    checks.L10.debtSize = debt ? debt.length : null;
  }

  const ok = Object.keys(checks).every(function (k) { return checks[k].ok; });
  return { ok: ok, checks: checks };
}

module.exports = {
  run: run,
  evidenceLexicalProblem: evidenceLexicalProblem,
  rawComparisonHits: rawComparisonHits,
  // L10의 판정 코어는 `evidence-name.js`가 소유한다. 여기서 re-export하는 것은
  // 소비처가 «lint의 검사»로 부를 수 있게 하기 위해서이고, 구현이 둘이 되지 않도록
  // 정의는 한 곳에만 둔다.
  evidenceNameProblems: evidenceName.evidenceNameProblems,
  nameAppears: evidenceName.nameAppears,
  EVIDENCE_WINDOW: evidenceName.EVIDENCE_WINDOW,
};

if (require.main === module) {
  const json = process.argv.indexOf('--json') !== -1;
  const result = run(process.cwd());
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    Object.keys(result.checks).forEach(function (k) {
      const c = result.checks[k];
      process.stdout.write((c.ok ? 'ok   ' : 'FAIL ') + k + ' — ' + c.check + '\n');
      if (!c.ok) c.problems.slice(0, 12).forEach(function (p) { process.stdout.write('       ' + p + '\n'); });
      if (!c.ok && c.problems.length > 12) process.stdout.write('       … and ' + (c.problems.length - 12) + ' more\n');
    });
  }
  process.exit(result.ok ? 0 : 1);
}
