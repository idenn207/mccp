'use strict';

// 게이트 배선 seam lint (diverse-agent-review M5 Task 5).
//
// `env-contract/lint.js` 의 run 구조를 축자로 계승한다: `run(repoRoot)` 가 `{ok, checks}`,
// 규칙별 `fail(check, problems)`, `--json` CLI + 비영점 exit.
//
// 이 lint 은 어떤 CI workflow 에도 어떤 hook 에도 등재되지 않는다 — 강제 지점은 사이클의
// `## Validation` 이다. CLAUDE.md §3.17 이 `env-contract/lint.js` 에 대해 이미 명시한 것과
// 같은 천장이며, 발동 지점 배선은 그 자체로 배선 추가라 이 milestone 의 범위 밖이다.

const fs = require('fs');
const path = require('path');

const rules = require('./rules');
const debtModule = require('./debt');

const COMMANDS_REL = 'plugins/mccp/commands';

function fail(check, messages) {
  return { ok: messages.length === 0, check: check, problems: messages };
}

// 코퍼스를 읽는다. 읽기 실패는 drift 이지 pass 가 아니다.
function readCorpus(root) {
  const dir = path.join(root, COMMANDS_REL);
  const result = { files: [], expected: 0, errors: [] };
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.md'); }).sort();
  } catch (e) {
    result.errors.push('cannot list ' + COMMANDS_REL + ': ' + e.message);
    return result;
  }
  // `filesExpected` 는 glob 실측이다. 하드코딩 상수면 그 자체가 다음 사이클의 낡은 사실이 된다.
  result.expected = names.length;
  names.forEach(function (name) {
    try {
      result.files.push({
        rel: COMMANDS_REL + '/' + name,
        src: fs.readFileSync(path.join(dir, name), 'utf8'),
      });
    } catch (e) {
      result.errors.push('cannot read ' + name + ': ' + e.message);
    }
  });
  return result;
}

// `opts.debt` 는 test 주입점이다. 기본값은 커밋된 `SEAM_DEBT` 이며, 주입 없이는 화석
// 탐지 경로(부채에 있으나 대응 위반이 사라진 항목)를 test 가 실제로 돌릴 수 없다 —
// 실코퍼스에서는 그 경로가 정의상 비어 있기 때문이다. 돌지 않는 분기는 없는 분기다.
function run(repoRoot, opts) {
  const root = repoRoot || process.cwd();
  const debtList = (opts && opts.debt) || debtModule.SEAM_DEBT;
  const corpus = readCorpus(root);
  const filesRead = corpus.files.length;
  const filesExpected = corpus.expected;

  // ── 코퍼스 무결성 ──────────────────────────────────────────────────────────
  // 부분 코퍼스는 zero-case 와 같은 무게로 실패한다. 파일 0개만 막는 가드는 부족하다:
  // 22개 중 5개만 읽어도 세 check 가 전부 통과해 게이트가 초록으로 보이는데, 커맨드 파일이
  // 개명·이동되면 정확히 그 형태로 seam 커버리지가 조용히 줄어든다.
  //
  // 이 problem 은 세 check **전부**에 실린다. 하나에만 실으면 나머지 둘이 green 으로 보여
  // "두 규칙은 통과했다"는 거짓 신호가 남는다 — 실제로는 어느 규칙도 전 코퍼스를 보지 않았다.
  const corpusProblems = [];
  corpus.errors.forEach(function (e) { corpusProblems.push(e); });
  // readdir 자체가 실패하면 `expected` 는 0 으로 남는다. 그때 "비었다"까지 덧붙이면 원인이
  // 둘인 것처럼 읽히므로, 이미 구체적 에러가 있으면 일반 메시지를 겹쳐 싣지 않는다.
  if (filesExpected === 0 && corpus.errors.length === 0) {
    corpusProblems.push('command corpus is empty — every check would pass vacuously');
  } else if (filesExpected > 0 && filesRead !== filesExpected) {
    corpusProblems.push('partial corpus: read ' + filesRead + ' of ' + filesExpected
      + ' command files (a partial read is drift, not a pass)');
  }

  // ── 규칙 실행 ──────────────────────────────────────────────────────────────
  const violations = [];
  corpus.files.forEach(function (f) {
    violations.push.apply(violations, rules.runRules(f.src, f.rel));
  });

  // ── 부채 소비 ──────────────────────────────────────────────────────────────
  // 면제는 키의 존재가 아니라 개수로 소비된다(debt.js 헤더 참조).
  const budget = debtModule.buildDebtBudget(debtList);
  const exempted = [];
  const live = [];
  violations.forEach(function (v) {
    const slot = budget.get(debtModule.violationKey(v));
    if (slot && slot.count > 0) {
      slot.count -= 1;
      exempted.push(v);
    } else {
      live.push(v);
    }
  });

  // 반대 방향 — 고쳐졌는데 목록에 남은 화석. 소비되지 않은 잔량이 그것이다.
  // 원본 row 를 그대로 들고 온다(키를 되파싱하지 않는다 — debt.js `buildDebtBudget` 주석 참조).
  const fossils = [];
  budget.forEach(function (slot) {
    for (let i = 0; i < slot.count; i++) fossils.push(slot.row);
  });

  const checks = {};
  rules.RULES.forEach(function (rule) {
    const problems = corpusProblems.slice();
    live.filter(function (v) { return v.rule === rule; }).forEach(function (v) {
      problems.push(v.file + ':' + v.line + ' — ' + v.why);
    });
    fossils.filter(function (row) { return row.rule === rule; }).forEach(function (row) {
      problems.push('debt entry no longer matches any violation (fossil): '
        + row.file + ':' + row.line + ' ' + row.rule + ' ' + row.textDigest
        + ' — the seam was fixed or the text changed; remove the row and lower SEAM_DEBT_CEILING');
    });
    checks[rule] = fail(ruleTitle(rule), problems);
  });

  const ok = Object.keys(checks).every(function (k) { return checks[k].ok; });

  return {
    ok: ok,
    checks: checks,
    debt: exempted.map(function (v) {
      return { file: v.file, line: v.line, rule: v.rule, why: v.why };
    }),
    filesRead: filesRead,
    filesExpected: filesExpected,
  };
}

function ruleTitle(rule) {
  if (rule === 'S1') return 'captured exit status is read after its capture, in the same fence';
  if (rule === 'S2') return 'a non-blocking call does not terminate a branch';
  return 'fail-open instrumentation does not discard stderr';
}

// CLI 전용 repo-root 탐색 (code-review L2). `run()` 은 순수하게 남긴다 — 인자로 받은 root
// 를 그대로 쓰는 성질에 test 가 의존한다(임시 코퍼스 주입). 탐색은 호출 지점에서만 한다.
//
// 하위 디렉토리에서 실행하면 이전에는 `cannot list plugins/mccp/commands: ENOENT` 로 끝나
// 원인이 "코퍼스가 깨졌다"처럼 읽혔다. 실제 원인은 cwd 였다. 위로 올라가며 `commands/` 를
// 실제로 갖는 조상을 찾고, 못 찾으면 cwd 로 돌아가 종전대로 fail-closed 한다.
function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, COMMANDS_REL))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

module.exports = {
  run: run,
  readCorpus: readCorpus,
  findRepoRoot: findRepoRoot,
  COMMANDS_REL: COMMANDS_REL,
};

if (require.main === module) {
  const json = process.argv.indexOf('--json') !== -1;
  const result = run(findRepoRoot(process.cwd()));
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write('corpus: read ' + result.filesRead + '/' + result.filesExpected
      + ' · debt ' + result.debt.length + '\n');
    Object.keys(result.checks).forEach(function (k) {
      const c = result.checks[k];
      process.stdout.write((c.ok ? 'ok   ' : 'FAIL ') + k + ' — ' + c.check + '\n');
      if (!c.ok) c.problems.slice(0, 12).forEach(function (p) { process.stdout.write('       ' + p + '\n'); });
      if (!c.ok && c.problems.length > 12) process.stdout.write('       … and ' + (c.problems.length - 12) + ' more\n');
    });
  }
  process.exit(result.ok ? 0 : 1);
}
