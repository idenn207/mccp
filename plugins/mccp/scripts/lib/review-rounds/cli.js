'use strict';

// review-rounds/cli — 명령 본문이 부르는 표면 (env-contract-integrity M3 / Task 2).
//
//   seal   --gate <gate-id> --decision <slug>   게이트 진입 시 1회. 정책을 봉인한다.
//   status [--gate .. --decision ..] [--json]   봉인 관측 + 원장 count (진단, 비파괴)
//   clear                                       봉인 제거 (원장은 건드리지 않는다)
//
// **`seal`은 성공과 실패 모두 exit 0이다.** 봉인 실패로 게이트를 막으면 새 코드가
// 파이프라인 전체를 세우게 되고, 실패했을 때의 동작은 M3 이전과 동일(강제 없음)이므로
// 나빠지는 것이 없다. 대신 안정된 prefix로 시끄럽게 실패한다 — 조용한 강등이야말로 이
// 축에서 가장 위험한 실패다(codex-policy.js의 같은 판단을 미러).
//
// **`clear`는 원장을 지우지 않는다.** 원장을 지우는 것은 곧 캡을 리셋하는 것이라, 그
// 능력을 게이트가 부르는 CLI에 두면 "막히면 clear"가 규범이 되어 캡이 장식이 된다.
// 손상된 원장의 복구 경로는 `ledger.js`의 에러 문구가 파일 경로와 함께 안내한다.
//
// **경로 플래그가 없다.** `--state-path` / `--state-dir`는 프로그래매틱 전용이고 여기에
// 노출되지 않는다 — 노출하면 repo-root 앵커링과 `assertContained`가 플래그 하나로
// 무력화되고 원장이 `.gitignore` 보호 밖에 생긴다 (CLAUDE.md 3.13 선례).

const seal = require('./seal');
const ledger = require('./ledger');

const EX_OK = 0;
const EX_USAGE = 2;

function errln(line) {
  process.stderr.write('[mccp:review-rounds] ' + line + '\n');
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.indexOf('--') !== 0) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && next.indexOf('--') !== 0) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

function str(v) { return (typeof v === 'string' && v !== '') ? v : null; }

function cmdSeal(flags) {
  const gitDir = seal.resolveGitDir(process.cwd());
  if (!gitDir) {
    errln('SEAL FAILED: no .git found from ' + process.cwd() +
      ' — round-cap enforcement is inert this run (same behaviour as before M3)');
    return EX_OK;
  }
  const gateId = str(flags.gate);
  const decisionId = str(flags.decision);
  if (!gateId || !decisionId) {
    // 기존 봉인을 **지우고** 실패한다. 그러지 않으면 앞 게이트가 남긴 봉인이 살아남아,
    // 이 게이트의 chokepoint가 **남의 (gate, decision) 키**로 판정하고 계상한다 —
    // 한 decision은 거짓 소진을, 다른 decision은 무제한 라운드를 얻는다.
    //
    // 도달 경로가 실재한다: 세 명령 본문이 `--decision "$ROUND_SLUG"`를 넘기는데
    // `derive-decision`이 실패하면 그 변수는 빈 문자열이고, 여기 걸린다.
    //
    // `sealCap`의 정상 경로는 이미 «지우고-쓰기»라 write 실패도 stale을 남기지 않는다.
    // 조기반환만 그 규율 밖에 있었다.
    seal.clearCap({ gitDir: gitDir });
    errln('SEAL FAILED: --gate and --decision are both required — the ledger key is ' +
      '(gate id, decision slug) and a seal without it cannot enforce anything. ' +
      'Any previous seal was CLEARED so this run degrades to no enforcement rather ' +
      'than counting against another gate\'s ledger.');
    return EX_OK;
  }
  try {
    const body = seal.sealCap({
      gitDir: gitDir, env: process.env, gateId: gateId, decisionId: decisionId,
    });
    errln('sealed cap=' + body.cap + ' mode=' + body.mode +
      (body.pinned ? ' pinned-by=' + body.pinned_by : '') +
      ' key=' + body.gate_id + '__' + body.decision_id +
      ' at ' + seal.sealPathFor(gitDir));
  } catch (err) {
    errln('SEAL FAILED: ' + (err && err.message ? err.message : String(err)) +
      ' — round-cap enforcement is inert this run (same behaviour as before M3)');
  }
  return EX_OK;
}

function cmdStatus(flags) {
  const gitDir = seal.resolveGitDir(process.cwd());
  const observed = seal.readCap({ gitDir: gitDir });
  const gateId = str(flags.gate) || observed.gateId;
  const decisionId = str(flags.decision) || observed.decisionId;

  let rounds = null;
  let ledgerError = null;
  if (gateId && decisionId) {
    try {
      rounds = ledger.count({ gateId: gateId, decisionId: decisionId });
    } catch (err) {
      ledgerError = err && err.message ? err.message : String(err);
    }
  }

  const payload = {
    seal: observed,
    gate_id: gateId,
    decision_id: decisionId,
    rounds_so_far: rounds,
    ledger_error: ledgerError,
    ledger_path: (gateId && decisionId && !ledgerError)
      ? ledger.resolveStatePath({ gateId: gateId, decisionId: decisionId })
      : null,
  };
  process.stdout.write(JSON.stringify(payload, null, flags.json ? 0 : 2) + '\n');
  return EX_OK;
}

function cmdClear() {
  const gitDir = seal.resolveGitDir(process.cwd());
  const removed = seal.clearCap({ gitDir: gitDir });
  errln(removed ? 'seal cleared (the round ledger is untouched)' : 'no seal to clear');
  return EX_OK;
}

function main(argv) {
  const sub = argv[0];
  const flags = parseFlags(argv.slice(1));
  if (sub === 'seal') return cmdSeal(flags);
  if (sub === 'status') return cmdStatus(flags);
  if (sub === 'clear') return cmdClear();
  process.stderr.write('[mccp:review-rounds] unknown subcommand ' +
    JSON.stringify(sub || '') + '\n' +
    '  usage: review-rounds/cli.js seal --gate <gate-id> --decision <slug>\n' +
    '         review-rounds/cli.js status [--gate <gate-id>] [--decision <slug>] [--json]\n' +
    '         review-rounds/cli.js clear\n');
  return EX_USAGE;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main: main, parseFlags: parseFlags };
