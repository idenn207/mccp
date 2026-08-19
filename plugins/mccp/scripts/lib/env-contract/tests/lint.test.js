'use strict';

// lint.test.js — 9개 검사가 **각각 실제로 붉어지는지**를 확인한다.
//
// exit 0만 보는 검사는 «빈 JSON을 뱉고 정상 종료하는 lint»도 통과시킨다. 그래서 여기서는
// 검사마다 그것 하나만 위반하는 fixture를 만들고, 그 fixture에서 **그 검사만** 실패하는지
// 본다. fixture가 없는 검사는 «통과»가 아니라 «검사되지 않음»이다.
//
// L9는 `.js`와 `.md` **두 확장자로 각각** fixture를 갖는다. 하나만 두면 L9가 `.js`만 걷도록
// 되돌아가도 test가 초록이고, 그러면 «주장 범위 == 검사 범위»가 관측되지 않는다.
//
// L8은 순서 전용 fixture를 따로 갖는다 — **디스크에 실재하는 절대경로**다. 그 경로는 test
// 실행 시점에 계산하며(`__filename`) 소스에 literal로 적지 않는다: 리터럴 절대경로는
// 커밋물에 홈 디렉토리를 남기고, 반대로 합성 절대경로는 디스크에 없어 두 순서 모두가
// 거부하므로 fixture가 순서를 구분하지 못한다(공허).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lint = require('../lint');
const scan = require('../scan');
const registry = require('../registry');

// tests → env-contract → lib → scripts → mccp → plugins → repo root (6단계).
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

const tmpRoots = [];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((e) => {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

const STUB_SNAPSHOT = `'use strict';
module.exports = {
  scanSurfaceDetailed: function () { return { toggles: ['MCCP_SKIP_RECEIPT'] }; },
  crossCheckExclusions: function () { return { drift: [] }; },
};
`;

// 깨끗한 baseline 파일. 등록된 boolean 이름을 담되 raw 비교는 하지 않는다.
const CLEAN_JS = `'use strict';
const envValue = require('x');
function f(env) { return envValue.parseBool(env, 'MCCP_SKIP_RECEIPT'); }
module.exports = { f: f };
`;
const CLEAN_MD = `# probe

\`\`\`bash
node -e "require('x').parseBool(process.env, 'MCCP_SKIP_RECEIPT')"
\`\`\`
`;

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-envlint-'));
  tmpRoots.push(root);
  copyDir(path.join(REPO_ROOT, 'docs', 'environment'), path.join(root, 'docs', 'environment'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'docs', 'ENVIRONMENT.md'), path.join(root, 'docs', 'ENVIRONMENT.md'));
  fs.mkdirSync(path.join(root, 'plugins/mccp/scripts/state'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins/mccp/scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins/mccp/commands'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/state/toggle-snapshot.js'), STUB_SNAPSHOT);
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/lib/probe.js'), CLEAN_JS);
  fs.writeFileSync(path.join(root, 'plugins/mccp/commands/probe.md'), CLEAN_MD);
  materializeEvidence(root);
  return root;
}

// L8은 evidence 경로를 **이 root 기준으로** 실재 확인한다. 합성 repo에 그 파일들이 없으면
// L8이 어느 fixture에서나 붉어져서 `only()`가 «정확히 이 검사만 깨진다»를 확인하지 못한다.
// 그래서 baseline에서 evidence가 가리키는 파일을 필요한 줄 수만큼 만들어 둔다 — 내용이
// 아니라 «그 줄이 존재하는가»가 L8의 검사 대상이다. 등록된 이름을 본문에 쓰지 않는 것이
// 중요하다: 쓰면 L4(은퇴 이름 부재)와 L9(raw 비교)의 baseline을 오염시킨다.
function materializeEvidence(root) {
  const need = new Map();
  registry.ENTRIES.forEach((e) => {
    const m = /^(.*):(\d+)$/.exec(String(e.evidence).trim());
    if (!m) return;
    const rel = m[1];
    const line = Number.parseInt(m[2], 10);
    need.set(rel, Math.max(need.get(rel) || 0, line));
  });
  need.forEach((lines, rel) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let existing = 0;
    try { existing = fs.readFileSync(abs, 'utf8').split(/\r?\n/).length; } catch (_) { existing = 0; }
    if (existing >= lines) return;
    const filler = new Array(lines - existing).fill('// evidence placeholder').join('\n');
    fs.appendFileSync(abs, (existing ? '\n' : '') + filler + '\n');
  });
}

function cleanup() {
  while (tmpRoots.length) {
    const d = tmpRoots.pop();
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

function only(result, check) {
  const failed = Object.keys(result.checks).filter((k) => !result.checks[k].ok);
  assert.deepEqual(failed, [check],
    'fixture must break exactly ' + check + ', got [' + failed.join(', ') + ']');
}

let negativeFixtures = 0;
let fixtureJs = 0;
let fixtureMd = 0;

test('baseline — 손대지 않은 fixture repo에서는 9개가 전부 통과한다', () => {
  const root = makeRepo();
  const r = lint.run(root);
  const failed = Object.keys(r.checks).filter((k) => !r.checks[k].ok);
  assert.deepEqual(failed, [], 'baseline이 붉으면 아래 fixture들이 무엇을 증명하는지 알 수 없다');
  assert.equal(Object.keys(r.checks).length, 9);
});

test('L1 — 레지스트리에 없는 런타임 토글', () => {
  const root = makeRepo();
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/state/toggle-snapshot.js'),
    STUB_SNAPSHOT.replace("['MCCP_SKIP_RECEIPT']", "['MCCP_SKIP_RECEIPT', 'MCCP_NOT_REGISTERED_AT_ALL']"));
  const r = lint.run(root);
  only(r, 'L1');
  assert.match(r.checks.L1.problems.join('\n'), /MCCP_NOT_REGISTERED_AT_ALL/);
  negativeFixtures++;
});

test('L2 — 색인에만 있고 레지스트리에 없는 행', () => {
  const root = makeRepo();
  const p = path.join(root, 'docs', 'ENVIRONMENT.md');
  fs.appendFileSync(p, '\n|`MCCP_GHOST_ROW`|bool|on/off|off|유령|[→](environment/gates.md#mccp_skip_receipt)|\n');
  const r = lint.run(root);
  only(r, 'L2');
  assert.match(r.checks.L2.problems.join('\n'), /MCCP_GHOST_ROW/);
  negativeFixtures++;
});

test('L3 — 상세 링크의 앵커가 목적지에 없다', () => {
  const root = makeRepo();
  const p = path.join(root, 'docs', 'ENVIRONMENT.md');
  const body = fs.readFileSync(p, 'utf8')
    .replace('environment/gates.md#mccp_skip_receipt', 'environment/gates.md#no-such-anchor');
  fs.writeFileSync(p, body);
  const r = lint.run(root);
  only(r, 'L3');
  assert.match(r.checks.L3.problems.join('\n'), /no-such-anchor/);
  negativeFixtures++;
});

test('L4 — 은퇴한 이름이 런타임 표면에 다시 나타난다', () => {
  const root = makeRepo();
  const retired = registry.ENTRIES.find((e) => e.status === 'retired');
  assert.ok(retired, '은퇴 항목이 없으면 이 검사는 공허하다');
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/lib/zombie.js'),
    "'use strict';\nconst v = process.env." + retired.name + ";\nmodule.exports = { v: v };\n");
  const r = lint.run(root);
  only(r, 'L4');
  assert.match(r.checks.L4.problems.join('\n'), new RegExp(retired.name));
  negativeFixtures++;
});

test('L5 — 출시된 표면에 stale 상태 마커가 남아 있다', () => {
  const root = makeRepo();
  fs.appendFileSync(path.join(root, 'docs', 'ENVIRONMENT.md'), '\n이 축은 \u{1F6A7} 예정이다.\n');
  const r = lint.run(root);
  only(r, 'L5');
  negativeFixtures++;
});

test('L6 — 제외 분류표가 규범 문서와 어긋난다', () => {
  const root = makeRepo();
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/state/toggle-snapshot.js'),
    STUB_SNAPSHOT.replace('{ drift: [] }', "{ drift: ['MCCP_SOMETHING: doc says A, table says B'] }"));
  const r = lint.run(root);
  only(r, 'L6');
  negativeFixtures++;
});

test('L7 — 사용 예시 없는 토글 앵커', () => {
  const root = makeRepo();
  fs.appendFileSync(path.join(root, 'docs', 'environment', 'gates.md'),
    '\n### MCCP_EXAMPLE_LESS\n\n**종류** `bool`\n');
  const r = lint.run(root);
  only(r, 'L7');
  assert.match(r.checks.L7.problems.join('\n'), /MCCP_EXAMPLE_LESS/);
  negativeFixtures++;
});

test('L8 — evidence 어휘 검사가 fs 실재 확인보다 먼저 돈다', () => {
  // 디스크에 **실재하는** 절대경로. 실재를 먼저 보는 구현은 이것을 통과시키고,
  // 어휘를 먼저 보는 구현만 거부한다 — 그래서 이 하나가 순서를 반증 가능하게 만든다.
  const existingAbsolute = __filename;
  assert.ok(path.isAbsolute(existingAbsolute));
  assert.ok(fs.existsSync(existingAbsolute), 'fixture는 실재해야 순서를 구분한다');
  const problem = lint.evidenceLexicalProblem(existingAbsolute + ':1');
  assert.ok(problem, '실재하는 절대경로도 어휘 단계에서 거부돼야 한다');
  assert.match(problem, /absolute path/);
  process.stdout.write('LINT L8-order=ok\n');

  // 나머지 어휘 규칙도 각각 거부한다.
  [
    'plugins/../../etc/passwd:1',
    '~/secrets/registry.js:1',
    'file:///tmp/x.js:1',
    '%USERPROFILE%/x.js:1',
    'plugins/mccp/scripts/lib/env-contract/registry.js',
    '',
  ].forEach((bad) => {
    assert.ok(lint.evidenceLexicalProblem(bad), 'should reject: ' + JSON.stringify(bad));
  });
  assert.equal(lint.evidenceLexicalProblem('plugins/mccp/scripts/lib/env-contract/registry.js:1'), null);
  negativeFixtures++;
});

test('L9 — raw 비교가 .js와 .md 양쪽에서 각각 잡힌다 (범위 등식의 반증 장치)', () => {
  const flag = registry.byKind('bypass-flag')[0].name;

  const jsRoot = makeRepo();
  fs.writeFileSync(path.join(jsRoot, 'plugins/mccp/scripts/lib/raw.js'),
    "'use strict';\nif (process.env." + flag + " === '1') { module.exports = 1; }\n");
  const jsResult = lint.run(jsRoot);
  only(jsResult, 'L9');
  assert.match(jsResult.checks.L9.problems.join('\n'), /raw\.js/);
  fixtureJs++;

  const mdRoot = makeRepo();
  fs.writeFileSync(path.join(mdRoot, 'plugins/mccp/commands/raw.md'),
    "# raw\n\n```bash\nnode -e \"if (process.env." + flag + " === '1') process.exit(1)\"\n```\n");
  const mdResult = lint.run(mdRoot);
  only(mdResult, 'L9');
  assert.match(mdResult.checks.L9.problems.join('\n'), /raw\.md/,
    '.md fixture가 잡히지 않으면 L9가 .js만 걷도록 되돌아간 것이다');
  fixtureMd++;

  negativeFixtures++;
});

test('L9 — load-time 별칭 포획과 구조분해도 잡는다', () => {
  const flag = registry.byKind('bypass-flag')[0].name;
  const aliasRoot = makeRepo();
  fs.writeFileSync(path.join(aliasRoot, 'plugins/mccp/scripts/lib/alias.js'),
    "'use strict';\nconst E = process.env." + flag + ";\nmodule.exports = E === '1';\n");
  only(lint.run(aliasRoot), 'L9');

  const destrRoot = makeRepo();
  fs.writeFileSync(path.join(destrRoot, 'plugins/mccp/scripts/lib/destr.js'),
    "'use strict';\nconst { " + flag + " } = process.env;\nmodule.exports = " + flag + " === '1';\n");
  only(lint.run(destrRoot), 'L9');
});

test('L9가 scan.walkSurfaces를 실제로 호출한다 (spy)', () => {
  const root = makeRepo();
  const original = scan.walkSurfaces;
  let calls = 0;
  let lastLength = -1;
  scan.walkSurfaces = function (r) {
    calls++;
    const out = original(r);
    lastLength = out.length;
    return out;
  };
  let result;
  try {
    result = lint.run(root);
  } finally {
    scan.walkSurfaces = original;
  }
  assert.ok(calls >= 1, 'L9가 자체 walk를 되살렸다면 spy가 0이다');
  // 호출 횟수만으로는 «L9가» 불렀는지 알 수 없다(L4도 같은 함수를 쓴다). L9가 보고한
  // 파일 수가 spy가 돌려준 목록의 길이와 같다는 것이 그 결속의 관측이다.
  assert.equal(result.checks.L9.filesScanned, lastLength,
    'L9가 보고한 파일 수는 walkSurfaces가 돌려준 목록에서 와야 한다');
  process.stdout.write('LINT walk-spy=' + calls + '\n');
});

test('읽기 실패는 통과가 아니라 drift로 보고된다', () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, 'docs', 'ENVIRONMENT.md'));
  const r = lint.run(root);
  assert.equal(r.checks.L2.ok, false);
  assert.match(r.checks.L2.problems.join('\n'), /cannot read/);
});

test('마커 — 7c가 대조할 fixture 수와 확장자 분포를 찍는다', () => {
  process.stdout.write('LINT negative-fixtures=' + negativeFixtures
    + ' js=' + fixtureJs + ' md=' + fixtureMd + '\n');
  assert.equal(negativeFixtures, 9, 'L1..L9 각각에 붉어지는 fixture가 하나씩 있어야 한다');
  assert.ok(fixtureJs >= 1);
  assert.ok(fixtureMd >= 1);
  cleanup();
});
