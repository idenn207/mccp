'use strict';
// santa-delta-review M2 Task 3 (Layer 2) 측정 harness — fixture + 두 모드 스코프 산출.
// test 의 makeCorpusRepo / resolveScope 를 그대로 옮긴다(경로만 영속).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = '<REPO_ROOT>';
const LIB = path.join(REPO, 'plugins/mccp/scripts/lib/santa');
const corpusLib = require(path.join(LIB, 'detection-corpus'));
const { runCli } = require(path.join(LIB, 'cli'));

const OUT = process.argv[2];

function cli(args) {
  const outC = [], errC = [];
  const so = process.stdout.write, se = process.stderr.write;
  process.stdout.write = function (c) { outC.push(String(c)); return true; };
  process.stderr.write = function (c) { errC.push(String(c)); return true; };
  let code;
  try { code = runCli(args); } finally { process.stdout.write = so; process.stderr.write = se; }
  return { code, stdout: outC.join(''), stderr: errC.join('') };
}
function writeFile(repo, rel, content) {
  const abs = path.join(repo, rel.split('/').join(path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const corpus = corpusLib.buildCorpus();
const dir = path.join(OUT, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const g = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
g(['init', '-q']);
g(['checkout', '-q', '-b', 'corpus-fixture']);
g(['config', 'user.email', 'santa@test.local']);
g(['config', 'user.name', 'santa']);
corpus.files.forEach((f) => writeFile(dir, f.path, f.content));
g(['add', '-A']); g(['commit', '-qm', 'rev0: corpus']);
corpus.fix.files.forEach((f) => writeFile(dir, f.path, f.content));
g(['add', '-A']); g(['commit', '-qm', corpus.fix.message]);
const fixRev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
writeFile(dir, '.claude/state/santa-loop/tmp/' + corpus.decisionSlug + '/round-1-fix-rev.txt', fixRev + '\n');
const pathsFile = path.join(dir, 'diff-paths.json');
fs.writeFileSync(pathsFile, JSON.stringify(corpus.diffPaths) + '\n');

function resolveScope(mode) {
  const saved = process.env.MCCP_SANTA_DELTA_SCOPE;
  process.env.MCCP_SANTA_DELTA_SCOPE = mode;
  try {
    const d = cli(['scope-delta', '--decision', corpus.decisionSlug, '--cwd', dir, '--paths-file', pathsFile]);
    if (d.code !== 0) throw new Error('scope-delta ' + mode + ': ' + d.stderr);
    const delta = JSON.parse(d.stdout);
    const narrowed = path.join(dir, 'narrowed-' + mode + '.json');
    fs.writeFileSync(narrowed, JSON.stringify(delta.paths) + '\n');
    const a = cli(['scope-always', '--decision', corpus.decisionSlug, '--cwd', dir, '--paths-file', narrowed]);
    if (a.code !== 0) throw new Error('scope-always ' + mode + ': ' + a.stderr);
    const always = JSON.parse(a.stdout);
    return { delta, always, scope: { paths: always.paths, ranges: delta.ranges } };
  } finally {
    if (saved === undefined) delete process.env.MCCP_SANTA_DELTA_SCOPE;
    else process.env.MCCP_SANTA_DELTA_SCOPE = saved;
  }
}

const result = { fixtureDir: dir, fixRev, decisionSlug: corpus.decisionSlug, defects: corpus.defects, modes: {} };
['off', 'enforce'].forEach((mode) => {
  const r = resolveScope(mode);
  const cov = corpusLib.coverageOf({ manifest: corpus.defects, scope: r.scope });
  // 블라인드 프롬프트는 CLI 가 낸다(DD4) — 여기서 조립하지 않는다.
  const rangesFile = path.join(dir, 'ranges-' + mode + '.json');
  fs.writeFileSync(rangesFile, JSON.stringify(r.delta.ranges) + '\n');
  const scopePaths = path.join(dir, 'scope-paths-' + mode + '.json');
  fs.writeFileSync(scopePaths, JSON.stringify(r.scope.paths) + '\n');
  // `lanes` 는 cwd 를 containment gate 로 삼는다(--cwd 표면 없음) — fixture 안에서 부른다.
  const cwd0 = process.cwd();
  let l;
  try { process.chdir(dir); l = cli(['lanes', '--paths-file', scopePaths, '--ranges-file', rangesFile]); }
  finally { process.chdir(cwd0); }
  if (l.code !== 0) throw new Error('lanes ' + mode + ': ' + l.stderr);
  result.modes[mode] = {
    delta: { applied: r.delta.applied, reason: r.delta.reason, before: r.delta.before, after: r.delta.after },
    scope: r.scope,
    coverage: cov.records,
    lanes: JSON.parse(l.stdout),
  };
});
fs.writeFileSync(path.join(OUT, 'scopes.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ fixtureDir: dir, fixRev,
  off: { paths: result.modes.off.scope.paths, ranges: result.modes.off.scope.ranges, assignment: result.modes.off.lanes.assignment },
  enforce: { paths: result.modes.enforce.scope.paths, ranges: result.modes.enforce.scope.ranges, assignment: result.modes.enforce.lanes.assignment } }, null, 2));
