#!/usr/bin/env node
'use strict';

// multi-session-work-loop M5 — 단일 writer 불변식 lint (G1) + 단언 매니페스트 대조.
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
// 선례: lib/msw-metrics/b2-coverage-gate.js (정적 lint + CLI/test 이중 표면)
//
// **lint는 test가 아니라 독립 CLI다.** test 안에서만 도는 검사는 test를 건너뛰면
// 함께 사라지는데, CL-5가 4회 재발한 이유가 정확히 "기계 검사가 통과 경로에
// 없었다"이다. Validation §10이 test runner와 무관하게 이 파일을 직접 부른다.
//
// **범위 밖(명시)**: 이 lint를 `/mccp:pr` Phase 1의 강제 게이트로 승격하는 것은
// 하지 않는다 — 게이트 강도 변경은 UI3가 이번 주기 범위 밖으로 못박았다. 보증하는
// 것은 "검사가 존재하고 Validation이 호출한다"이지 "우회 불가"가 아니다.

const fs = require('fs');
const path = require('path');

const SCRIPTS_ROOT = path.resolve(__dirname, '..', '..');            // plugins/mccp/scripts
const REPO_ROOT = path.resolve(SCRIPTS_ROOT, '..', '..', '..');      // repo root

// 감사자 자신. 이 파일은 금지 패턴을 **데이터로** 담고 있어 자기 자신을 잡는다
// (b2-coverage-gate.js의 SELF_EXEMPT와 같은 이유).
const SELF = 'plugins/mccp/scripts/lib/state-journal/single-writer-lint.js';

// 축 1 승인 writer — `writeStateAtomic`을 소유하는 모듈 하나뿐이다.
const APPROVED_STATE_WRITERS = ['plugins/mccp/scripts/state/state-writer.js'];

// 축 2 — GROUND가 실측 열거한 STATE.md 소비 호출부 14곳. **이 배열이 커밋
// 아티팩트다**: 줄 번호가 아니라 소스 라인의 본문을 고정하므로, 줄이 밀려도
// 통과하고 호출 형태가 바뀌면 실패한다. 그것이 G3이 지키려는 것이다.
//
// `session-start.js`·`session-end.js`는 파일 전체가 아니라 **해당 호출부 줄만**
// 대상이므로 Task 8의 CL-5 편집과 충돌하지 않는다(G3 주의).
const STATE_CONSUMER_CALLSITES = [
  { file: 'plugins/mccp/scripts/derive/sources/state.js', text: 'state = stateWriter.readState(repoRoot);' },
  { file: 'plugins/mccp/scripts/hooks/auto-handoff.js', text: 'const s = stateWriter.readState(root);' },
  { file: 'plugins/mccp/scripts/hooks/ecc-context-monitor.js', text: 'try { stateWriter.update(repoRoot, patch); } catch { /* swallow */ }' },
  { file: 'plugins/mccp/scripts/hooks/ecc-context-monitor.js', text: 'const st = stateWriter.readState(repoRoot);' },
  { file: 'plugins/mccp/scripts/hooks/session-start.js', text: 'const existing = stateWriter.readState(injectorRepoRoot);' },
  { file: 'plugins/mccp/scripts/hooks/session-start.js', text: 'stateWriter.update(injectorRepoRoot, {' },
  { file: 'plugins/mccp/scripts/hooks/stop-review-loop.js', text: "stateWriter.update(repoRoot, { event: 'stop_loop_pass' });" },
  { file: 'plugins/mccp/scripts/receipt/write.js', text: 'const st = stateWriter.readState(repoRoot);' },
  { file: 'plugins/mccp/scripts/receipt/write.js', text: 'const existing = stateWriter.readState(repoRoot);' },
  { file: 'plugins/mccp/scripts/receipt/write.js', text: 'stateWriter.update(repoRoot, {' },
  { file: 'plugins/mccp/scripts/state/breakpoint-detector.js', text: ': (root ? stateWriter.readState(root) : null);' },
  { file: 'plugins/mccp/scripts/state/session-spawner.js', text: 'return stateWriter.update(root, {' },
];

// 축 3 — CL-5 대상 3함수.
const HANDOFF_FNS = ['enumerateUnfinishedItems', 'writeHandoffItems', 'restoreAndMatch'];
const HANDOFF_OWNER = 'plugins/mccp/scripts/state/handoff-items.js';
// 정적 추적 창. 같은 함수 스코프 근사 — 임의 깊이 별칭·재할당·고차 함수 경유는
// 잡지 못하며 그것이 **명시 잔여 9**다.
const SCOPE_WINDOW = 60;

// 축 4 — handoff-items는 저널과 통합하지 않는다.
const FORBIDDEN_IN_HANDOFF = [/require\(\s*['"][^'"]*state-journal/, /require\(\s*['"][^'"]*journal-store/];

// 축 5 — 투영 순수성.
const PROJECT_FILE = 'plugins/mccp/scripts/lib/state-journal/project.js';
const FORBIDDEN_IN_PROJECT = ['fs', 'child_process', 'net', 'os'];

function toPosix(p) { return String(p).split(path.sep).join('/'); }

function walkJs(dir, out) {
  out = out || [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'tests') continue;
      walkJs(full, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function relFromRepo(abs) {
  return toPosix(path.relative(REPO_ROOT, abs));
}

function stripComment(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return line;
}

// ── 축 1 ─────────────────────────────────────────────────────────────────────
function axisSingleWriter(files) {
  const violations = [];
  const WRITE_RE = /writeStateAtomic\s*\(/;
  const STATE_PATH_WRITE_RE = /(writeFileSync|writeFile|appendFileSync|renameSync|copyFileSync)\s*\([^)]*STATE\.md/;
  for (const abs of files) {
    const rel = relFromRepo(abs);
    if (rel === SELF) continue;
    if (APPROVED_STATE_WRITERS.indexOf(rel) !== -1) continue;
    let src = '';
    try { src = fs.readFileSync(abs, 'utf8'); } catch (_e) { continue; }
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = stripComment(lines[i]);
      if (!line) continue;
      if (WRITE_RE.test(line) || STATE_PATH_WRITE_RE.test(line)) {
        violations.push({ axis: 1, file: rel, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return violations;
}

// ── 축 2 ─────────────────────────────────────────────────────────────────────
// `sites`/`root`는 부정 fixture 주입용 override다(기본값이 실제 커밋 아티팩트).
// 이 구멍이 없으면 "lint가 실제로 잡는가"를 회귀로 고정할 수 없다.
function axisConsumerCallsites(sites, root) {
  const violations = [];
  for (const site of (sites || STATE_CONSUMER_CALLSITES)) {
    const abs = path.isAbsolute(site.file) ? site.file : path.join(root || REPO_ROOT, site.file);
    let src = '';
    try { src = fs.readFileSync(abs, 'utf8'); } catch (_e) {
      violations.push({ axis: 2, file: site.file, reason: 'file unreadable', text: site.text });
      continue;
    }
    if (src.indexOf(site.text) === -1) {
      violations.push({
        axis: 2, file: site.file, reason: 'STATE.md consumer call site changed or removed', text: site.text,
      });
    }
  }
  return violations;
}

// 인자 추출은 **괄호 균형**으로 한다. 순진한 `\(([^)]*)`는 첫 `)`에서 끊기므로
// `fn(process.cwd())`의 인자가 `process.cwd(` 로 잘리고 — 즉 잡아야 할 CL-5 형태
// 바로 그것을 통과시킨다(회귀 test `axis 3b: a process.cwd() literal argument
// fails`가 이 결함을 잡았다).
function extractCallArgs(line, fn) {
  const marker = '.' + fn;
  const at = line.indexOf(marker);
  if (at === -1) return null;
  let i = at + marker.length;
  while (i < line.length && /\s/.test(line[i])) i++;
  if (line[i] !== '(') return null;
  const start = i + 1;
  let depth = 0;
  for (; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')') {
      depth--;
      if (depth === 0) return line.slice(start, i);
    }
  }
  return line.slice(start);   // 멀티라인 호출 — 줄 끝까지
}

function splitTopLevel(args) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

// ── 축 3 ─────────────────────────────────────────────────────────────────────
//
// (a) 경로 인자를 **전달**하고 (b) 그 인자가 `process.cwd()` 리터럴도, 같은
// 스코프의 1-hop 별칭도 아니며 (c) `resolveHandoffRoot(` 반환에서 파생한다.
//
// (b)만으로는 부족하다: `const f = process.cwd(); fn(f)`가 리터럴 검사를 통과한다.
// (c)가 없으면 `resolveHandoffRoot`를 만들고도 호출부가 쓰지 않는 no-op 수정을
// 아무 검사도 잡지 못한다.
function axisHandoffPaths(files) {
  const violations = [];
  for (const abs of files) {
    const rel = relFromRepo(abs);
    if (rel === SELF || rel === HANDOFF_OWNER) continue;
    let src = '';
    try { src = fs.readFileSync(abs, 'utf8'); } catch (_e) { continue; }
    if (HANDOFF_FNS.every(function (fn) { return src.indexOf(fn + '(') === -1; })) continue;

    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = stripComment(lines[i]);
      if (!line) continue;
      for (const fn of HANDOFF_FNS) {
        const args = extractCallArgs(line, fn);
        if (args === null) continue;

        // (a) 인자 전달
        const argList = splitTopLevel(args);
        const pathArgIdx = fn === 'enumerateUnfinishedItems' ? 0 : (fn === 'restoreAndMatch' ? 1 : 2);
        const hasPathArg = argList.length > pathArgIdx || /\{$/.test(line) || /,\s*\{$/.test(line);
        if (!hasPathArg) {
          violations.push({ axis: 3, rule: 'a', file: rel, line: i + 1, fn: fn, text: lines[i].trim() });
          continue;
        }

        const scopeStart = Math.max(0, i - SCOPE_WINDOW);
        const scope = lines.slice(scopeStart, i + 6).join('\n');

        // (b) process.cwd() 리터럴 또는 1-hop 지역 별칭
        const cwdLiteral = /process\.cwd\(\)/.test(argList[pathArgIdx] || '');
        let cwdAlias = false;
        const ident = (argList[pathArgIdx] || '').match(/^[A-Za-z_$][\w$]*$/);
        if (ident) {
          const aliasRe = new RegExp('(?:const|let|var)\\s+' + ident[0] + '\\s*=\\s*process\\.cwd\\(\\)');
          cwdAlias = aliasRe.test(scope);
        }
        if (cwdLiteral || cwdAlias) {
          violations.push({
            axis: 3, rule: 'b', file: rel, line: i + 1, fn: fn,
            reason: cwdLiteral ? 'process.cwd() literal' : 'one-hop process.cwd() alias',
            text: lines[i].trim(),
          });
          continue;
        }

        // (c) resolveHandoffRoot 경유
        if (!/resolveHandoffRoot\s*\(/.test(scope)) {
          violations.push({
            axis: 3, rule: 'c', file: rel, line: i + 1, fn: fn,
            reason: 'no resolveHandoffRoot() call in the enclosing scope — the path may bypass the empty-projectRoot guard',
            text: lines[i].trim(),
          });
        }
      }
    }
  }
  return violations;
}

// ── 축 4 ─────────────────────────────────────────────────────────────────────
function axisHandoffIndependence(overridePath) {
  const violations = [];
  const abs = overridePath || path.join(REPO_ROOT, HANDOFF_OWNER);
  let src = '';
  try { src = fs.readFileSync(abs, 'utf8'); } catch (_e) {
    return [{ axis: 4, file: HANDOFF_OWNER, reason: 'file unreadable' }];
  }
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]);
    if (!line) continue;
    for (const re of FORBIDDEN_IN_HANDOFF) {
      if (re.test(line)) {
        violations.push({
          axis: 4, file: HANDOFF_OWNER, line: i + 1, text: lines[i].trim(),
          reason: 'handoff-items must NOT depend on the journal (M5 keeps it an independent sidecar)',
        });
      }
    }
  }
  return violations;
}

// ── 축 5 ─────────────────────────────────────────────────────────────────────
function axisProjectionPurity(overridePath) {
  const violations = [];
  const abs = overridePath || path.join(REPO_ROOT, PROJECT_FILE);
  let src = '';
  try { src = fs.readFileSync(abs, 'utf8'); } catch (_e) {
    return [{ axis: 5, file: PROJECT_FILE, reason: 'file unreadable' }];
  }
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]);
    if (!line) continue;
    for (const mod of FORBIDDEN_IN_PROJECT) {
      const re = new RegExp("require\\(\\s*['\"]" + mod + "['\"]\\s*\\)");
      if (re.test(line)) {
        violations.push({
          axis: 5, file: PROJECT_FILE, line: i + 1, module: mod, text: lines[i].trim(),
          reason: 'project() must stay pure (DD4) — I/O belongs to journal-store.js',
        });
      }
    }
  }
  return violations;
}

// ── 단언 매니페스트 대조 (--assertions) ──────────────────────────────────────
const MANIFEST_PATH = 'docs/multi-session-work-loop/m5-assertion-manifest.json';

function collectTestTitles() {
  const titles = new Set();
  const testDirs = [
    path.join(SCRIPTS_ROOT, 'lib', 'tests'),
    path.join(SCRIPTS_ROOT, 'state', 'tests'),
  ];
  for (const dir of testDirs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_e) { continue; }
    for (const n of names) {
      if (!n.endsWith('.test.js')) continue;
      let src = '';
      try { src = fs.readFileSync(path.join(dir, n), 'utf8'); } catch (_e) { continue; }
      const re = /\btest\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
      let m;
      while ((m = re.exec(src)) !== null) titles.add(m[2]);
    }
  }
  return titles;
}

function runAssertions() {
  const abs = path.join(REPO_ROOT, MANIFEST_PATH);
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (err) {
    return { ok: false, error: 'manifest unreadable at ' + MANIFEST_PATH + ': ' + (err && err.message) };
  }
  const list = Array.isArray(manifest) ? manifest : manifest.assertions;
  if (!Array.isArray(list)) return { ok: false, error: 'manifest has no assertions array' };
  const titles = collectTestTitles();
  const assertions = list.map(function (a) {
    return { task: a.task, id: a.id, title: a.title, present: titles.has(a.title) };
  });
  const absent = assertions.filter(function (a) { return !a.present; });
  return { ok: absent.length === 0, assertions: assertions, absent_count: absent.length };
}

function runLint() {
  const files = walkJs(SCRIPTS_ROOT);
  const violations = []
    .concat(axisSingleWriter(files))
    .concat(axisConsumerCallsites())
    .concat(axisHandoffPaths(files))
    .concat(axisHandoffIndependence())
    .concat(axisProjectionPurity());
  const byAxis = {};
  for (const v of violations) byAxis[v.axis] = (byAxis[v.axis] || 0) + 1;
  return {
    ok: violations.length === 0,
    scanned_files: files.length,
    violations: violations,
    violations_by_axis: byAxis,
  };
}

function main(argv) {
  const wantJson = argv.indexOf('--json') !== -1;
  if (argv.indexOf('--assertions') !== -1) {
    const out = runAssertions();
    process.stdout.write(JSON.stringify(out, null, wantJson ? 2 : 0) + '\n');
    return out.ok ? 0 : 1;
  }
  const out = runLint();
  if (wantJson) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    process.stdout.write('[m5:single-writer-lint] ' + (out.ok ? 'OK' : 'FAILED') +
      ' — scanned ' + out.scanned_files + ' file(s), ' + out.violations.length + ' violation(s)\n');
    for (const v of out.violations) {
      process.stdout.write('  axis ' + v.axis + (v.rule ? '(' + v.rule + ')' : '') + ' ' +
        v.file + (v.line ? ':' + v.line : '') + ' — ' + (v.reason || v.text || '') + '\n');
    }
  }
  return out.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  runLint: runLint,
  runAssertions: runAssertions,
  collectTestTitles: collectTestTitles,
  axisSingleWriter: axisSingleWriter,
  axisConsumerCallsites: axisConsumerCallsites,
  axisHandoffPaths: axisHandoffPaths,
  axisHandoffIndependence: axisHandoffIndependence,
  axisProjectionPurity: axisProjectionPurity,
  STATE_CONSUMER_CALLSITES: STATE_CONSUMER_CALLSITES,
  MANIFEST_PATH: MANIFEST_PATH,
  SELF: SELF,
};
