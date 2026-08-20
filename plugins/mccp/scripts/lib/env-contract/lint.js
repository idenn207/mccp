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

  const ok = Object.keys(checks).every(function (k) { return checks[k].ok; });
  return { ok: ok, checks: checks };
}

module.exports = { run: run, evidenceLexicalProblem: evidenceLexicalProblem, rawComparisonHits: rawComparisonHits };

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
