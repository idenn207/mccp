'use strict';

// env-contract/cli.js — 레지스트리의 CLI 투영 + 설정 진단 (M1).
//
// **새 선언원을 만들지 않는다.** 세 서브커맨드 전부 호출 시점에 레지스트리에서
// 파생하며 자체 표를 갖지 않는다 — 이 도구가 또 하나의 진실원이 되면 그것이 바로
// 이 계약이 없애려던 drift다.
//
// `doctor`는 **진단이며 게이트가 아니다**(DD6·UI13). hook 등록 0건, receipt 0건이고
// 어떤 게이트도 이 종료코드를 읽지 않는다. 0/1/2는 사람과 스크립트를 위한 것이다.
//
// mirror: lib/meta-research.js `USAGE` 상수 + 서브커맨드 화이트리스트 + 오용 exit 2
//         + `--json`/사람용 이중 출력 + repoRoot는 인자가 아니라 cwd에서 도출.

const fs = require('fs');
const os = require('os');
const path = require('path');

const registry = require('./registry');
const vocabulary = require('./vocabulary');
const settingsLayers = require('./settings-layers');
const doctor = require('./doctor');

const USAGE = [
  'usage: node plugins/mccp/scripts/lib/env-contract/cli.js <command> [options]',
  '',
  'commands:',
  '  list [--domain <d>] [--status <s>] [--kind <k>] [--json]',
  '      레지스트리 열거. 필터 값은 레지스트리 상수로 검증되며 오탈자는 exit 2다.',
  '  explain <NAME> [--json]',
  '      한 토글의 kind · values · default · 소비처 evidence · 상세 앵커 ·',
  '      settings.json 예시. 계약 격리 대상이면 어긋남 경고를 함께 낸다.',
  '  doctor [--all] [--json]',
  '      선언한 값(3계층)과 프로세스가 받은 값을 나란히 놓는다.',
  '      --all 은 이 계약이 소유하지 않는 이름을 **이름만** 덧붙인다 (값 미표시).',
  '',
  'exit: 0 = error 0건 · 1 = error 1건 이상 · 2 = 오용',
  '',
  'doctor 는 진단이며 게이트가 아니다 — 어떤 hook 도 receipt 도 이 종료코드를 읽지 않는다.',
].join('\n');

const COMMANDS = Object.freeze(['list', 'explain', 'doctor']);

// 명령마다 받는 플래그를 명시한다. 열거하지 않으면 `doctor --all` 을 배운 사람이
// `list --all` 을 쳤을 때 조용히 무시되고, 그 침묵은 «--all 이 안 먹는 목록»이라는
// 잘못된 결론을 만든다. 오탈자를 exit 2 로 되돌려 주는 `validateChoice` 와 같은 이유다.
const COMMAND_FLAGS = Object.freeze({
  list: Object.freeze(['json', 'domain', 'status', 'kind']),
  explain: Object.freeze(['json']),
  doctor: Object.freeze(['json', 'all']),
});

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_MISUSE = 2;

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, 'plugins', 'mccp', 'scripts'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(startDir || process.cwd());
    dir = up;
  }
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') { flags.json = true; continue; }
    if (a === '--all') { flags.all = true; continue; }
    if (a.indexOf('--') === 0) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.indexOf('--') === 0) return { error: 'flag --' + key + ' needs a value' };
      flags[key] = next;
      i += 1;
      continue;
    }
    flags._.push(a);
  }
  return flags;
}

// 홈·저장소 접두를 접는다. 이 도구는 절대경로를 stdout 으로 내보내는데, 그 출력이
// PR 본문이나 이슈에 복사되는 순간 CLAUDE.md §3.12 가 receipt `meta.cwd` 에서 막은
// 것과 같은 형태의 누출이 된다. 접어도 «어느 계층의 어느 파일인가» 는 그대로 읽힌다.
function redactPath(abs, homeDir, repoRoot) {
  const norm = function (v) { return String(v || '').replace(/\\/g, '/'); };
  const target = norm(abs);
  const repo = norm(repoRoot).replace(/\/+$/, '');
  const home = norm(homeDir).replace(/\/+$/, '');
  const under = function (base) {
    return base !== '' && target.toLowerCase().indexOf(base.toLowerCase() + '/') === 0;
  };
  if (under(repo)) return './' + target.slice(repo.length + 1);
  if (under(home)) return '~/' + target.slice(home.length + 1);
  return target;
}

function misuse(message) {
  process.stderr.write('[env-contract] ' + message + '\n\n' + USAGE + '\n');
  return EXIT_MISUSE;
}

// 필터 값은 레지스트리 상수를 화이트리스트로 검증한다. 검증하지 않으면 오탈자가
// «결과 0건»으로 조용히 나와, 없는 것과 못 찾은 것을 구분할 수 없다.
function validateChoice(flags, key, allowed) {
  if (flags[key] === undefined) return null;
  if (allowed.indexOf(flags[key]) === -1) {
    return 'unknown --' + key + ' "' + flags[key] + '"; expected one of: ' + allowed.join(', ');
  }
  return null;
}

function cmdList(flags) {
  const bad = validateChoice(flags, 'domain', registry.DOMAINS)
    || validateChoice(flags, 'status', registry.STATUSES)
    || validateChoice(flags, 'kind', registry.KINDS);
  if (bad) return misuse(bad);

  const rows = registry.ENTRIES.filter(function (e) {
    if (flags.domain && e.domain !== flags.domain) return false;
    if (flags.status && e.status !== flags.status) return false;
    if (flags.kind && e.kind !== flags.kind) return false;
    return true;
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ count: rows.length, entries: rows }, null, 2) + '\n');
    return EXIT_OK;
  }
  rows.forEach(function (e) {
    const values = e.values ? e.values.join('|') : '—';
    const def = e.default === null ? '—' : (e.default === '' ? '(빈 값)' : e.default);
    process.stdout.write(e.name + '\n');
    process.stdout.write('  ' + e.kind + ' · values ' + values + ' · default ' + def
      + ' · ' + e.status + ' · ' + e.domain + '\n');
    process.stdout.write('  ' + e.summary + '\n');
  });
  process.stdout.write('\n' + rows.length + ' toggle(s)\n');
  return EXIT_OK;
}

function cmdExplain(flags, repoRoot) {
  const name = flags._[0];
  if (!name) return misuse('explain needs a toggle name');
  const e = registry.get(name);
  if (!e) return misuse('unknown toggle "' + name + '" — try `list` to enumerate');

  const resolved = vocabulary.resolveVocabulary(repoRoot, e);
  const q = vocabulary.quarantineByName().get(name);
  const example = { env: {} };
  example.env[name] = e.default === null ? (e.values ? e.values[0] : '<value>') : e.default;

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      entry: e,
      vocabulary: resolved.ok
        ? { ok: true, form: resolved.form, values: resolved.values, source: resolved.source }
        : { ok: false, form: resolved.form, reason: resolved.reason },
      quarantined: q || null,
      settingsExample: example,
    }, null, 2) + '\n');
    return q ? EXIT_FINDINGS : EXIT_OK;
  }

  process.stdout.write(name + '\n');
  process.stdout.write('  kind      ' + e.kind + '\n');
  process.stdout.write('  values    ' + (e.values ? e.values.join(' | ') : '—') + '\n');
  process.stdout.write('  default   ' + (e.default === null ? '—' : (e.default === '' ? '(빈 값)' : e.default)) + '\n');
  process.stdout.write('  status    ' + e.status + '\n');
  process.stdout.write('  domain    ' + e.domain + '\n');
  process.stdout.write('  evidence  ' + e.evidence + '\n');
  process.stdout.write('  detail    docs/' + e.doc + '\n');
  if (resolved.ok) {
    process.stdout.write('  code      ' + resolved.values.join(' | ') + '  (via ' + resolved.source + ')\n');
  } else {
    process.stdout.write('  code      (미해석: ' + resolved.form + ') ' + resolved.reason + '\n');
  }
  process.stdout.write('\n  .claude/settings.json 예시:\n');
  JSON.stringify(example, null, 2).split('\n').forEach(function (l) {
    process.stdout.write('    ' + l + '\n');
  });
  if (q) {
    process.stdout.write('\n  ! 계약 격리 대상 — 문서의 값이 코드와 어긋난다.\n');
    process.stdout.write('    ' + q.reason + '\n');
    process.stdout.write('    코드가 실제로 받는 값: ' + q.actual.join(' | ') + '  (담당 ' + q.owner + ')\n');
    return EXIT_FINDINGS;
  }
  return EXIT_OK;
}

function cmdDoctor(flags, repoRoot) {
  const homeDir = os.homedir();
  const layers = settingsLayers.readLayers({ repoRoot: repoRoot, homeDir: homeDir });
  const layerRows = layers.layers.map(function (l) {
    return Object.assign({}, l, { path: redactPath(l.path, homeDir, repoRoot) });
  });
  const vocabularies = {};
  registry.ENTRIES.forEach(function (e) {
    if (e.kind !== 'enum' && e.kind !== 'list') return;
    vocabularies[e.name] = vocabulary.resolveVocabulary(repoRoot, e);
  });

  const result = doctor.diagnose({
    declared: layers.declared,
    processEnv: process.env,
    entries: registry.ENTRIES,
    vocabularies: vocabularies,
    quarantine: vocabulary.quarantineByName(),
    all: flags.all === true,
    // 하네스 밖에서는 «선언이 도달했는가» 라는 질문 자체가 성립하지 않는다.
    harness: doctor.detectHarness(process.env),
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      layers: layerRows,
      findings: result.findings,
      counts: result.counts,
      ok: result.ok,
      gate: false,
    }, null, 2) + '\n');
    return result.ok ? EXIT_OK : EXIT_FINDINGS;
  }

  process.stdout.write('settings 계층\n');
  layerRows.forEach(function (l) {
    process.stdout.write('  ' + l.layer.padEnd(8) + l.state.padEnd(14) + l.count + ' env key(s)  ' + l.path + '\n');
    if (l.error) process.stdout.write('           ! ' + l.error + '\n');
  });

  ['error', 'warning', 'info'].forEach(function (sev) {
    const rows = result.findings.filter(function (f) { return f.severity === sev; });
    if (!rows.length) return;
    process.stdout.write('\n' + sev + ' (' + rows.length + ')\n');
    rows.forEach(function (f) {
      process.stdout.write('  [' + f.code + '] ' + f.name + '\n');
      process.stdout.write('    ' + f.message + '\n');
      if (f.declared !== undefined || f.actual !== undefined) {
        process.stdout.write('    선언 ' + JSON.stringify(f.declared === undefined ? null : f.declared)
          + '  →  프로세스 ' + JSON.stringify(f.actual === undefined ? null : f.actual) + '\n');
      }
    });
  });

  process.stdout.write('\nerror ' + result.counts.error + ' · warning ' + result.counts.warning
    + ' · info ' + result.counts.info + '  —  진단이며 게이트가 아니다\n');
  return result.ok ? EXIT_OK : EXIT_FINDINGS;
}

function main(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(USAGE + '\n');
    return command ? EXIT_OK : EXIT_MISUSE;
  }
  if (COMMANDS.indexOf(command) === -1) return misuse('unknown command "' + command + '"');

  const flags = parseFlags(argv.slice(1));
  if (flags.error) return misuse(flags.error);

  const allowed = COMMAND_FLAGS[command];
  const stray = Object.keys(flags).filter(function (k) {
    return k !== '_' && allowed.indexOf(k) === -1;
  });
  if (stray.length) {
    return misuse('unknown flag(s) for ' + command + ': --' + stray.join(', --')
      + '; accepted: --' + allowed.join(', --'));
  }
  if (command === 'explain' && flags._.length > 1) {
    return misuse('explain takes exactly one toggle name, got ' + flags._.length + ': ' + flags._.join(', '));
  }
  if (command !== 'explain' && flags._.length) {
    return misuse(command + ' takes no positional arguments, got: ' + flags._.join(', '));
  }

  const repoRoot = findRepoRoot(process.cwd());
  if (command === 'list') return cmdList(flags);
  if (command === 'explain') return cmdExplain(flags, repoRoot);
  return cmdDoctor(flags, repoRoot);
}

module.exports = { main: main, USAGE: USAGE, COMMANDS: COMMANDS, findRepoRoot: findRepoRoot, parseFlags: parseFlags };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
