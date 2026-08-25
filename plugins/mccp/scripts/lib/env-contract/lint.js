'use strict';

// env-contract/lint.js — 레지스트리 · 런타임 스캔 · 색인 표의 삼각 정합 검사 (v1.29.1).
//
// 10개 검사는 전부 fail-closed다. 읽기 실패는 «통과»가 아니라 drift로 보고한다 —
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
//   L10 레지스트리 `values`가 코드의 어휘 상수와 집합으로 같은가 (격리는 양방향)
//   L11 상세 문서의 값별 결과 · 멤버 어휘 블록이 레지스트리와 양방향으로 같은가
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
const vocabulary = require('./vocabulary');
const scan = require('./scan');

const INDEX_REL = 'docs/ENVIRONMENT.md';
const DETAIL_DIR_REL = 'docs/environment';
// 은퇴 항목에 사용법을 다는 것은 모순이므로 L7에서 제외한다.
const EXAMPLE_EXEMPT = 'retired.md';

// ── L11 파싱 규격 ───────────────────────────────────────────────────────────
// 규격을 코드 옆에 **명시**한다. 없으면 fail-closed가 조용한 degrade로 무너진다 —
// 「블록을 못 찾았다」와 「블록이 비었다」가 구현 세부에 따라 통과로 접히기 때문이다.
//
//   섹션 경계  `### <NAME>` 부터 다음 `### ` 또는 파일 끝까지 (L7의 분할과 같은 규약)
//   블록 시작  섹션 안에서 라벨 한 줄. 0개면 problem, 2개 이상이면 problem —
//              모호한 소스에서 임의로 하나를 고르는 것은 fail-open이다
//   블록 끝    그 뒤 첫 `**사용 예시**` 줄. 부재면 problem — 경계가 정의되지 않은
//              상태를 통과로 치지 않는다 (L7이 이미 그 줄을 모든 앵커에 요구한다)
//   fence      블록 안의 ``` 구간은 스캔에서 제외한다
//   항목 줄    `- ``<값>`` — <서술>` (em-dash 구분자 필수, 값은 백틱 안)
//
// **vacuous-pass 차단**: 항목 0줄은 통과가 아니라 problem이고, 대상 집합이 비어도
// problem이다. 「못 읽었으므로 위반이 없다」는 이 파일에서 통과가 아니다.
const VALUE_RESULT_LABEL = '**값별 결과**';
const MEMBER_VOCAB_LABEL = '**멤버 어휘**';
const BLOCK_END_LABEL = '**사용 예시**';
const ALLOWED_TOKENS_PREFIX = '**허용 토큰** — ';
const UNKNOWN_MEMBER_PREFIX = '**미상 멤버** — ';
const NO_ENUMERATION_MARKER = '열거 없음';
// 서술의 **품질**은 기계로 잴 수 없다(DD3). 재는 것은 «자리가 채워졌는가»뿐이다.
const MIN_DESCRIPTION_CHARS = 8;
const PLACEHOLDER_DESCRIPTIONS = ['tbd', 'todo', 'n/a', 'na', '?', '-', '—', '...', '…'];
const BULLET_RE = /^-\s+`([^`\n]+)`\s+—\s+(.*)$/;

// 한 앵커의 구조 블록을 잘라 낸다. 실패는 전부 `{ok:false, reason}`이다.
function sliceBlock(sectionLines, label) {
  const starts = [];
  sectionLines.forEach(function (l, i) { if (l.trim() === label) starts.push(i); });
  if (starts.length === 0) return { ok: false, reason: 'no ' + label + ' block' };
  if (starts.length > 1) {
    return { ok: false, reason: starts.length + ' ' + label + ' blocks — ambiguous, refusing to pick one' };
  }
  // 시작과 **같은 규약**으로 찾는다(라벨 단독 줄). startsWith 로 두면 헤더의 산문
  //  `**사용 예시**는 전부 …` 같은 줄이 종료로 오인돼 블록이 조기에 잘린다.
  // fence 안의 예시 줄도 종료로 세지 않는다 — 본문 추출과 같은 토글을 쓴다.
  let end = -1;
  let scanFence = false;
  for (let i = starts[0] + 1; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    if (/^s*```/.test(line)) { scanFence = !scanFence; continue; }
    if (!scanFence && line.trim() === BLOCK_END_LABEL) { end = i; break; }
  }
  if (end === -1) {
    return { ok: false, reason: label + ' has no ' + BLOCK_END_LABEL + ' terminator — the block boundary is undefined' };
  }
  // fence 구간 제거. 블록 안에 예시 코드가 들어와도 항목 줄로 오인하지 않는다.
  const body = [];
  let inFence = false;
  for (let i = starts[0] + 1; i < end; i += 1) {
    const line = sectionLines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) body.push(line);
  }
  return { ok: true, body: body };
}

function splitAnchorSections(text) {
  const map = new Map();
  text.split(/\n(?=### )/).forEach(function (sec) {
    const hm = /^### ([A-Z][A-Z0-9_]*)/.exec(sec);
    if (hm) map.set(hm[1], sec.split(/\r?\n/));
  });
  return map;
}

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

  // L10 — `values`와 코드 어휘의 집합 대조
  //
  // L1~L9는 전부 계약 **내부**(레지스트리 ↔ 색인 ↔ 상세)의 정합만 본다. 셋이 서로를
  // 베끼므로, 존재하지 않는 값이 레지스트리에 들어가면 세 표면에 일관되게 복제된 뒤
  // green으로 보고된다. L10은 그 바깥과 결속하는 유일한 검사다.
  //
  // 판정은 kind마다 다르다(DD9). enum은 `values`와 코드 어휘가 **집합 동일**해야 하고,
  // list는 `values`가 오늘 전부 null이므로 «어휘가 지정됐고 해석되는가»까지만 본다 —
  // 여기서 동일성을 요구하면 M1이 M2의 문서화 작업을 강제로 끌어온다.
  {
    const problems = [];
    const notes = [];
    const quarantine = vocabulary.quarantineByName();
    const seenQuarantine = new Set();
    const targets = registry.byKind('enum').concat(registry.byKind('list'));
    if (targets.length === 0) {
      problems.push('no enum/list entries — the vocabulary check would pass vacuously');
    }

    quarantine.forEach(function (q, name) {
      if (!byName.has(name)) {
        problems.push('quarantine names ' + name + ', which is not in the registry');
      }
    });

    targets.forEach(function (e) {
      const resolved = vocabulary.resolveVocabulary(root, e);
      const q = quarantine.get(e.name);
      if (q) seenQuarantine.add(e.name);

      if (!resolved.ok) {
        // 'gap'은 «읽을 수 없음»의 명시 열거라 통과시키되 기록한다(UI5). 그 밖의
        // 실패(ref가 안 풀린다 · 파생자가 없다 · 형태가 틀렸다)는 fail-closed다 —
        // 읽기 실패를 통과로 치면 문서가 낡았는지 아는 장치를 끄는 일이다.
        if (resolved.form === 'gap') {
          notes.push(e.name + ': vocabularyGap — ' + resolved.reason);
          if (q) {
            problems.push(e.name + ': quarantined but its vocabulary is a declared gap — '
              + 'a gap is not a mismatch, so the quarantine entry is meaningless');
          }
          return;
        }
        problems.push(e.name + ': cannot resolve vocabulary (' + resolved.form + ') — ' + resolved.reason);
        return;
      }

      if (e.kind === 'list') {
        // DD9 — list의 `values`는 오늘 전부 null이다. 지정과 해석까지가 M1의 요구다.
        //
        // 그래서 list는 **격리 대상이 될 수 없다.** 비교할 `values`가 없으면 «지금도
        // 어긋나는가»를 물을 수 없고, 물을 수 없으면 DD3-ii의 배수(수리되면 붉어진다)도
        // 성립하지 않는다 — 이 분기가 아래 동일성 검사보다 먼저 return하므로, 막지 않으면
        // list 격리 항목만 검사 없이 통과하는 영구 면죄부가 된다.
        if (q) {
          problems.push(e.name + ': quarantined but it is a list entry — a list has no documented '
            + '`values` to compare, so the quarantine could never be drained (DD3-ii). '
            + 'Quarantine is for enum entries only.');
        }
        notes.push(e.name + ': list vocabulary resolves (' + resolved.values.length + ' members via ' + resolved.source + ')');
        return;
      }

      const declared = (e.values || []).slice().sort();
      const actual = resolved.values.slice().sort();
      const same = declared.length === actual.length
        && declared.every(function (v, i) { return v === actual[i]; });

      if (same) {
        // DD3-ii — 격리는 배수된다. 수리된 항목이 격리표에 남아 있으면 실패한다.
        // 이 분기가 없으면 격리표는 영구 면죄부가 되어 M2가 고쳐도 아무도 지우지 않는다.
        if (q) {
          problems.push(e.name + ': quarantined but the mismatch is gone — remove the entry from '
            + 'vocabulary.js QUARANTINE (owner was ' + q.owner + ')');
        }
        return;
      }

      const detail = 'registry=[' + declared.join(',') + '] code=[' + actual.join(',')
        + '] via ' + resolved.source;
      if (!q) {
        problems.push(e.name + ': documented values do not match the code vocabulary — ' + detail);
        return;
      }
      // 격리 항목은 «지금도 실제로 어긋나는가»만이 아니라 «적어 둔 어긋남과 같은가»도
      // 봐야 한다. 형태가 달라졌는데 통과시키면 격리가 다른 결함을 덮는다.
      const qExpected = (q.expected || []).slice().sort();
      const qActual = (q.actual || []).slice().sort();
      const sameShape = qExpected.length === declared.length
        && qExpected.every(function (v, i) { return v === declared[i]; })
        && qActual.length === actual.length
        && qActual.every(function (v, i) { return v === actual[i]; });
      if (!sameShape) {
        problems.push(e.name + ': quarantined, but the observed mismatch differs from the recorded one — '
          + 'recorded expected=[' + qExpected.join(',') + '] actual=[' + qActual.join(',') + '], observed ' + detail);
        return;
      }
      notes.push(e.name + ': quarantined mismatch (owner ' + q.owner + ') — ' + detail);
    });

    quarantine.forEach(function (q, name) {
      if (byName.has(name) && !seenQuarantine.has(name)) {
        problems.push('quarantine names ' + name + ', which is not an enum/list entry and can never mismatch');
      }
    });

    checks.L10 = fail('registry values are bound to the code vocabulary', problems);
    checks.L10.notes = notes;
    checks.L10.quarantined = Array.from(seenQuarantine).sort();
  }

  // L11 — 값별 결과 · 멤버 어휘 블록의 양방향 대조
  //
  // L3~L7이 문서의 **존재**를 보는 데 반해 여기는 문서가 가르치는 **값의 목록**이
  // 레지스트리와 같은지를 본다. 산문을 스캔하지 않는 이유는 실측 때문이다: 값 토큰이
  // 본문 어딘가에 등장하는지 세면 오늘 이미 대부분 통과하므로 아무것도 강제하지 못한다
  // (하단 원문 블록의 값 나열까지 「등장」으로 세어진다). 그래서 값을 **키로 갖는 구조
  // 블록**만 본다 — 측정 불가능한 산문 속성을 측정 가능한 구조 속성으로 바꾼 것이다.
  //
  // 강제하는 명제는 정확히 「선언된 각 값에 한 줄이 있고, 선언에 없는 값의 줄은 없다」
  // 까지다. 그 줄이 코드와 맞는지는 사람이 읽어야 한다(DD3).
  {
    const problems = [];
    const notes = [];
    const targets = entries.filter(function (e) {
      // 은퇴 도메인 제외 — L7이 사용 예시를 면제하는 것과 같은 근거이고, 애초에
      // 블록의 종료 표지가 그 사용 예시 줄이라 면제된 앵커에는 경계가 없다.
      return e.domain !== 'retired' && (e.kind === 'enum' || e.kind === 'list');
    });
    if (targets.length === 0) {
      problems.push('no enum/list entries outside the retired domain — the block check would pass vacuously');
    }
    const sectionCache = new Map();
    targets.forEach(function (e) {
      const rel = DETAIL_DIR_REL + '/' + e.domain + '.md';
      if (!sectionCache.has(rel)) {
        const r = readFile(path.join(root, rel));
        sectionCache.set(rel, r.ok ? splitAnchorSections(r.text) : null);
      }
      const sections = sectionCache.get(rel);
      if (!sections) { problems.push(e.name + ': cannot read ' + rel + ' (read failure is drift, not a pass)'); return; }
      const sec = sections.get(e.name);
      if (!sec) { problems.push(e.name + ': no ### ' + e.name + ' anchor in ' + rel); return; }

      if (e.kind === 'enum') {
        const sliced = sliceBlock(sec, VALUE_RESULT_LABEL);
        if (!sliced.ok) { problems.push(e.name + ': ' + sliced.reason); return; }
        const seen = new Map();
        sliced.body.forEach(function (line) {
          const m = BULLET_RE.exec(line.trim());
          if (!m) return;
          const key = m[1];
          const desc = String(m[2]).trim();
          if (seen.has(key)) { problems.push(e.name + ': value `' + key + '` is listed more than once'); return; }
          seen.set(key, desc);
        });
        if (seen.size === 0) {
          problems.push(e.name + ': ' + VALUE_RESULT_LABEL + ' block has 0 parsable rows — an empty block is not a pass');
          return;
        }
        const declared = e.values || [];
        declared.forEach(function (v) {
          if (!seen.has(v)) problems.push(e.name + ': value `' + v + '` is declared in the registry but has no row');
        });
        seen.forEach(function (desc, key) {
          if (declared.indexOf(key) === -1) {
            problems.push(e.name + ': row for `' + key + '` has no matching registry value');
            return;
          }
          const lowered = desc.toLowerCase();
          if (desc.length < MIN_DESCRIPTION_CHARS || PLACEHOLDER_DESCRIPTIONS.indexOf(lowered) !== -1) {
            problems.push(e.name + ': row for `' + key + '` has a placeholder/too-short description');
          }
        });
        notes.push(e.name + ': ' + seen.size + ' value row(s)');
        return;
      }

      // list — 멤버 어휘. `values`가 null이라 집합 비교가 성립하지 않으므로, 대신
      // (a) 어휘의 출처와 (b) 미상 멤버 처리 방향이 **명시**돼 있는지를 본다.
      // 처리 방향의 정본은 vocabulary.js의 단일 표이고 여기서는 그 문장이 문서에
      // 그대로 실렸는지 대조한다 — 두 곳이 갈라지면 문서가 주장하는 방향과 진단이
      // 보고하는 방향이 달라진다(DD6).
      const sliced = sliceBlock(sec, MEMBER_VOCAB_LABEL);
      if (!sliced.ok) { problems.push(e.name + ': ' + sliced.reason); return; }
      const allowedLine = sliced.body.find(function (l) { return l.startsWith(ALLOWED_TOKENS_PREFIX); });
      const unknownLine = sliced.body.find(function (l) { return l.startsWith(UNKNOWN_MEMBER_PREFIX); });
      if (!allowedLine) { problems.push(e.name + ': ' + MEMBER_VOCAB_LABEL + ' block has no `' + ALLOWED_TOKENS_PREFIX.trim() + '` line'); }
      if (!unknownLine) { problems.push(e.name + ': ' + MEMBER_VOCAB_LABEL + ' block has no `' + UNKNOWN_MEMBER_PREFIX.trim() + '` line'); }
      const policy = vocabulary.LIST_MEMBER_POLICY[e.name];
      if (!policy) {
        problems.push(e.name + ': no LIST_MEMBER_POLICY entry — the unknown-member direction is undocumented');
      } else if (unknownLine && unknownLine.slice(UNKNOWN_MEMBER_PREFIX.length).trim() !== policy.trim()) {
        problems.push(e.name + ': the documented unknown-member direction differs from LIST_MEMBER_POLICY');
      }
      if (allowedLine) {
        const resolved = vocabulary.resolveVocabulary(root, e);
        if (resolved.ok) {
          if (allowedLine.indexOf(resolved.source) === -1) {
            problems.push(e.name + ': the 허용 토큰 line does not cite the vocabulary source (' + resolved.source + ')');
          }
        } else if (resolved.form !== 'gap') {
          // «어휘가 없다»(gap)와 «읽지 못했다»(ref/derive 실패 · malformed ·
          // unspecified)는 다른 사실이다. 둘을 한 분기로 접으면 상수 rename 으로
          // 어휘 참조가 깨진 항목이 문서의 「열거 없음」 한 줄로 통과한다 — DD7 이
          // 금지하는 «침묵과 구분되지 않는 예외»가 정확히 그것이다.
          problems.push(e.name + ': vocabulary could not be resolved (' + resolved.form + ': '
            + resolved.reason + ') — a read failure is drift, not a declared gap');
        } else if (allowedLine.indexOf(NO_ENUMERATION_MARKER) === -1) {
          // 선언된 gap 도 명시 형식으로만 허용한다.
          problems.push(e.name + ': vocabulary is a declared gap but the 허용 토큰 line does not say "' + NO_ENUMERATION_MARKER + '"');
        }
      }
      notes.push(e.name + ': member vocabulary block present');
    });
    checks.L11 = fail('detail docs spell out every declared value and list-member policy', problems);
    checks.L11.notes = notes;
    checks.L11.targets = targets.length;
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
