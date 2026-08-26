'use strict';

// lint.test.js — 10개 검사가 **각각 실제로 붉어지는지**를 확인한다.
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
const DEBT_NAMES = new Set(require('../evidence-debt').names());

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
// 그래서 baseline에서 evidence가 가리키는 파일을 필요한 줄 수만큼 만들어 둔다.
//
// M5(v1.32.0)부터 «그 줄이 존재하는가»만으로는 부족하다 — L10이 **그 줄이 그 이름을
// 말하는가**를 묻기 때문이다. 그래서 evidence가 가리키는 정확한 줄에 그 이름을 적되,
// **주석으로** 적는다. 형태가 load-bearing이다:
//   - L9는 `isCommentLine`으로 주석을 건너뛰므로 raw 비교 baseline이 오염되지 않는다.
//   - L4는 주석 예외가 없는 순수 `indexOf`이지만, status `retired` 7종은 전부 evidence가
//     `docs/environment/retired.md:1`(walkSurfaces 밖 · 이미 복사된 실파일)이라 이 함수가
//     애초에 그 이름을 쓰지 않는다. 그 사실이 깨지면 아래 단언이 먼저 붉어진다.
function materializeEvidence(root) {
  const need = new Map();     // rel -> { max: number, names: Map<line, string[]> }
  registry.ENTRIES.forEach((e) => {
    const m = /^(.*):(\d+)$/.exec(String(e.evidence).trim());
    if (!m) return;
    const rel = m[1];
    const line = Number.parseInt(m[2], 10);
    if (!need.has(rel)) need.set(rel, { max: 0, names: new Map() });
    const slot = need.get(rel);
    slot.max = Math.max(slot.max, line);
    if (e.status === 'retired') return;   // L4 보호 — 아래 단언이 이 전제를 검사한다
    // 면제 목록에 오른 이름은 **일부러 이름을 심지 않는다.** 심으면 fixture에서 그
    // 항목들이 통과해 버려서 L10의 역방향 래칫이 «목록에서 지워라»로 붉어진다 —
    // 그것은 fixture가 실제 트리와 다른 상태를 만들어 낸 것이지 결함이 아니다.
    // 목록이 설명하는 것은 이 저장소의 실제 드리프트이므로, fixture도 그 모양을 따른다.
    if (DEBT_NAMES.has(e.name)) return;
    if (!slot.names.has(line)) slot.names.set(line, []);
    slot.names.get(line).push(e.name);
  });

  // 전제 검사: 은퇴 이름을 런타임 표면 파일에 쓰려 하고 있으면 L4 baseline이 조용히
  // 오염된다. 조용히 통과시키느니 여기서 멈춘다.
  registry.ENTRIES.forEach((e) => {
    if (e.status !== 'retired') return;
    const rel = String(e.evidence).split(':')[0];
    assert.ok(rel.startsWith('docs/'),
      'retired ' + e.name + ' now has a runtime-surface evidence path (' + rel + '); '
      + 'materializeEvidence would write its name there and break the L4 baseline');
  });

  need.forEach((slot, rel) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let lines = [];
    try { lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/); } catch (_) { lines = []; }
    const originalLength = lines.length;
    while (lines.length < slot.max) lines.push('// evidence placeholder');
    slot.names.forEach((names, line) => {
      // 원본 내용(STUB_SNAPSHOT · 복사된 실파일)은 덮지 않는다 — 덮으면 그 파일을 쓰는
      // 다른 검사의 fixture가 무너진다. placeholder 영역만 이름을 싣는다.
      if (line <= originalLength) return;
      lines[line - 1] = '// evidence placeholder ' + names.join(' ');
    });
    if (lines.length === originalLength && slot.names.size === 0) return;
    fs.writeFileSync(abs, lines.join('\n') + '\n');
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

test('baseline — 손대지 않은 fixture repo에서는 10개가 전부 통과한다', () => {
  const root = makeRepo();
  const r = lint.run(root);
  const failed = Object.keys(r.checks).filter((k) => !r.checks[k].ok);
  // 실패하면 «무엇이» 붉은지까지 말한다 — 검사 이름만으로는 fixture를 고칠 수 없다.
  const why = failed.map((k) => k + ': ' + r.checks[k].problems.slice(0, 4).join(' | ')).join('\n');
  assert.deepEqual(failed, [],
    'baseline이 붉으면 아래 fixture들이 무엇을 증명하는지 알 수 없다\n' + why);
  assert.equal(Object.keys(r.checks).length, 10);
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

// L10은 순수 코어(`evidence-name.js`)가 `evidence-debt.test.js`에서 전수 단위 test되지만,
// 그 코어가 `run()` 안에서 **실제로 배선돼 있는지**는 별개 사실이다. 아래 둘이 그것을 잡는다.
test('L10 — evidence가 그 이름을 말하지 않으면 붉다', () => {
  const root = makeRepo();
  const victim = registry.ENTRIES.find((e) => e.status !== 'not-consumed'
    && e.status !== 'retired'
    && !DEBT_NAMES.has(e.name)
    && String(e.evidence).indexOf('plugins/mccp/scripts/') === 0);
  assert.ok(victim, 'need one non-exempt entry whose evidence lives on the script surface');
  const [rel, lineNo] = String(victim.evidence).split(':');
  const abs = path.join(root, rel);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  // 그 줄에서 이름만 지운다 — 파일도 줄 수도 그대로이므로 L8은 여전히 통과한다.
  // 즉 이 fixture가 증명하는 것은 «L10이 L8이 못 보는 것을 본다»이다.
  lines[Number(lineNo) - 1] = '// evidence placeholder';
  fs.writeFileSync(abs, lines.join('\n'));
  const r = lint.run(root);
  assert.equal(r.checks.L8.ok, true, 'L8은 형식과 실재만 보므로 여전히 통과해야 한다');
  only(r, 'L10');
  assert.match(r.checks.L10.problems.join('\n'), new RegExp(victim.name + ': evidence'));
  negativeFixtures++;
});

test('L10 — 면제 목록을 읽을 수 없으면 아무것도 면제되지 않는다', () => {
  const problems = lint.evidenceNameProblems({
    entries: [{ name: 'MCCP_SKIP_OBSERVE', status: 'retired', evidence: 'a.js:1' }],
    debt: null,
    debtError: 'boom',
    readLines: () => ['nothing'],
    surfaces: [{ rel: 's.js', text: '' }],
  });
  assert.ok(problems.some((p) => /evidence-debt is unusable/.test(p)));
  assert.ok(problems.some((p) => /MCCP_SKIP_OBSERVE: evidence/.test(p)),
    'a listed name must lose its exemption when the list cannot be read');
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
  // M5(v1.32.0): L10이 추가되며 9 → 10. 이 수는 «검사 개수»가 아니라 «붉어지는 fixture를
  // 실제로 가진 검사의 수»다 — L8은 fixture가 아니라 순서 전용 test로 덮이므로 세지 않고,
  // 대신 L9가 `.js`·`.md` 두 개를 갖는다. 늘릴 때는 그 짝을 함께 확인해야 한다.
  assert.equal(negativeFixtures, 10, 'L1..L7 · L9 · L10 각각에 붉어지는 fixture가 있어야 한다');
  assert.ok(fixtureJs >= 1);
  assert.ok(fixtureMd >= 1);
  cleanup();
});

// ── v1.32.1 M6 — L10 역방향 표면 확장 · 제외 앵커 ────────────────────────────
//
// `scan.walkSurfaces`는 env-contract/ 전체를 제외하므로(L1·L9에는 옳은 제외다) 역방향
// 부재 주장이 자기 구현 디렉토리를 보지 못했다. M6은 그 디렉토리에서 **값 해석 계층**
// 하나만 역방향에 더한다 — 다른 소비처(L1·L4·L9)의 입력은 바꾸지 않는다.

const ENV_CONTRACT_REL = 'plugins/mccp/scripts/lib/env-contract';
const ENV_CONTRACT_SIBLINGS = [
  'registry.js', 'lint.js', 'evidence-name.js',
  'evidence-debt.js', 'measure-evidence.js', 'scan.js',
];

// 정책표가 분류한 파일을 전부 실재하게 만든다. 하나라도 빠지면 «미분류» 검사가 아니라
// «표에 있는데 디스크에 없다»가 관측돼 test가 다른 것을 재게 된다.
function materializeEnvContractDir(root, valueJsText) {
  const dir = path.join(root, ENV_CONTRACT_REL);
  fs.mkdirSync(dir, { recursive: true });
  ENV_CONTRACT_SIBLINGS.forEach((n) => fs.writeFileSync(path.join(dir, n), "'use strict';\n"));
  fs.writeFileSync(path.join(dir, 'value.js'), valueJsText);
  return dir;
}

test('M6 L10 역방향: value.js에 심은 not-consumed 이름이 붉어진다', () => {
  const root = makeRepo();
  materializeEnvContractDir(root, "'use strict';\n// IMPECCABLE_PALETTE_SEED\n");
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, false,
    'value.js가 역방향 표면에 들어가지 않았다 — 부재 주장이 자기 구현 디렉토리를 못 본다');
  assert.ok(
    r.checks.L10.problems.some((p) => p.includes('IMPECCABLE_PALETTE_SEED') && p.includes('value.js')),
    '기대한 역방향 problem이 없다: ' + JSON.stringify(r.checks.L10.problems),
  );
});

test('M6 L10 역방향: 이름이 없으면 통과한다 (대조군 — 확장이 상시 붉히지 않는다)', () => {
  const root = makeRepo();
  materializeEnvContractDir(root, "'use strict';\n// nothing to see here\n");
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, true,
    '깨끗한 value.js에서 붉어졌다: ' + JSON.stringify(r.checks.L10.problems));
});

test('M6 L10 정책표: env-contract/의 미분류 .js는 침묵이 아니라 problem이다', () => {
  const root = makeRepo();
  const dir = materializeEnvContractDir(root, "'use strict';\n");
  fs.writeFileSync(path.join(dir, 'newcomer.js'), "'use strict';\n");
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, false, '분류되지 않은 새 파일이 조용히 통과했다');
  assert.ok(
    r.checks.L10.problems.some((p) => p.includes('newcomer.js') && p.includes('not classified')),
    '미분류 problem이 없다: ' + JSON.stringify(r.checks.L10.problems),
  );
});

test('M6 L10 정책표: 구현 디렉토리가 없는 root에서는 정책이 적용 대상 없음이다', () => {
  // makeRepo()는 env-contract/를 만들지 않는다. 부재를 «검사 실패»로 보고하면 그 거짓
  // 신호가 다른 검사의 fixture까지 오염시킨다 — 실제로 그렇게 무너진 적이 있다.
  const root = makeRepo();
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, true,
    '구현 디렉토리 부재가 problem으로 보고됐다: ' + JSON.stringify(r.checks.L10.problems));
});

test('M6 제외 앵커: 디렉토리 밖의 env-contract substring 경로는 더는 면제되지 않는다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-envanchor-'));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, ENV_CONTRACT_REL), { recursive: true });
  fs.writeFileSync(path.join(root, ENV_CONTRACT_REL, 'value.js'), CLEAN_JS);
  fs.writeFileSync(path.join(root, 'plugins/mccp/scripts/lib/env-contract-bridge.js'), CLEAN_JS);

  const files = scan.walkSurfaces(root);
  assert.ok(files.includes('plugins/mccp/scripts/lib/env-contract-bridge.js'),
    'substring 제외가 남아 있다 — 디렉토리 밖 파일이 이름만으로 조용히 면제된다');
  assert.ok(!files.includes(ENV_CONTRACT_REL + '/value.js'),
    '구현 디렉토리가 더는 제외되지 않는다 — 그 디렉토리는 raw 비교의 정당한 자리다');
});

test('L1(code-review): 표에 있는데 디스크에 없는 파일은 problem이다 (화석 방지 역방향)', () => {
  const root = makeRepo();
  const dir = materializeEnvContractDir(root, "'use strict';\n");
  // include:false로 분류된 파일 하나를 지운다. 이전에는 그 항목을 읽지 않으므로
  // 아무것도 붉지 않았고, 표는 존재하지 않는 파일에 사유를 다는 문서로 남았다.
  fs.unlinkSync(path.join(dir, 'measure-evidence.js'));
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, false, '표의 화석 항목이 조용히 통과했다');
  assert.ok(
    r.checks.L10.problems.some((p) => p.includes('measure-evidence.js') && p.includes('absent from')),
    '부재 problem이 없다: ' + JSON.stringify(r.checks.L10.problems),
  );
});

test('L1(code-review): 표와 디스크가 일치하면 통과한다 (대조군)', () => {
  const root = makeRepo();
  materializeEnvContractDir(root, "'use strict';\n");
  const r = lint.run(root);
  assert.equal(r.checks.L10.ok, true,
    '일치하는데 붉어졌다: ' + JSON.stringify(r.checks.L10.problems));
});
