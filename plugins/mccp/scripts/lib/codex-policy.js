'use strict';

// codex-policy — MCCP_CODEX_DISABLED 를 게이트 실행 단위로 봉인하고 판독하는 오라클.
//
// 왜 있는가. 이 토글은 codex-invoke.js 의 spawn 직전 short-circuit 한 곳에서만
// honor 됐다. 그것은 "호출 1건에 대한 분류"이지 게이트 전체에 걸리는 정책이 아니라서,
// R1 이 끝난 뒤 실행 주체가 env 를 0 으로 되돌리면 R2 는 그대로 Codex 를 불렀다
// (실측 보고 2026-08-25). 정책이 env 에만 살아 있는 한 그 창은 닫히지 않는다.
//
// 그래서 게이트 진입 시점의 정책을 디스크에 봉인하고, 판정을 `봉인 OR env` 로 만든다.
// OR 인 이유는 단조성이다 — 한 번 봉인된 disabled 는 env 를 지워도 되살아나지 않고,
// 실행 중 env 를 켜면 즉시 적용된다(비용이 줄어드는 방향). precedence(봉인 우선)를
// 쓰면 후자의 정상 조작이 무시된다.
//
// **판독 결과 셋의 처리가 서로 다르다** (plan-review R2 invariant HIGH 흡수):
//   absent      부재는 정상 상태다. 이 플래그를 쓴 적 없는 사용자가 다수이므로
//               env 단독으로 떨어진다. 여기서 fail-closed 를 택하면 그들의 Codex 가
//               조용히 꺼진다.
//   expired     같은 이유로 env 단독. 만료는 "봉인이 없었던 것과 같다"는 선언이다.
//   unreadable  부재가 **아니다**. 봉인이 있었는데 읽을 수 없다는 것은 이상 상태이고,
//               그 상태에서 env 를 믿으면 정확히 이 모듈이 막으려는 창이 다시 열린다.
//               비용이 줄어드는 방향(disabled)으로 접는다.
// 모듈 자체가 로드되지 않는 경우는 여기서 다루지 않는다 — 그때는 봉인 reader 가
// 존재하지 않으므로 호출부(codex-invoke.js)가 env 단독으로 강등한다.
//
// 보장의 경계는 **1회 게이트 실행**이다. 게이트를 다시 호출하면 진입 시 봉인이 새 env
// 로 덮어써지고 그것이 옳다 — 운영자가 토글을 끄고 다시 돌렸다면 정책을 바꾼 것이지
// 우회한 것이 아니다. 호출 경계를 넘는 lock 은 별도 기능이며 이 모듈의 주장이 아니다.
//
// mirror: review-single-pass.js:1-35 (모듈 형태 · 불량값 실패 방향의 비대칭) ·
//         env-contract/value.js:86-96 (env 판독은 항상 parseBool 경유) ·
//         plan.md 5.2z (write 후 즉시 read-back — exit code 만으로는 "0 을 반환했는데
//         빈 파일이 남는" 실패를 못 잡는다)

const fs = require('fs');
const path = require('path');
const envValue = require('./env-contract/value');

const ENV_CODEX_DISABLED = 'MCCP_CODEX_DISABLED';

// 봉인 파일은 저장소 단위 **하나**다. MCCP_CODEX_DISABLED 는 env 수준 운영자 정책이지
// decision 수준 사실이 아니고, 무엇보다 codex-invoke.js 는 gate id 도 decision slug 도
// 인자로 받지 않는다 — 그 둘로 키잉하면 1차 방어가 봉인을 찾을 수 없다.
const SEAL_REL_DIR = path.join('mccp', 'tmp');
const SEAL_BASENAME = 'codex-policy.json';

// 게이트 1회 실행이 6시간을 넘지 않는다는 관측에서 나온 상한이다(codex 타임아웃 900s,
// 게이트 deadline 1200~2400s). 임의의 knob 이 아니라 그 관측의 여유 배수이고, 이보다
// 오래된 봉인은 stale 로 보아 부재 취급한다 — 그러지 않으면 운영자가 Codex 를 다시 켠
// 뒤에도 죽은 봉인이 OR 을 통해 계속 끄게 된다.
//
// export 되는 이유: 산문에만 있는 상한은 검증할 대상이 없다. test 가 이 값을 직접
// 단언한다(plan-review R1 invariant HIGH 흡수).
const MAX_SEAL_AGE_MS = 6 * 60 * 60 * 1000;

const READ_REASONS = Object.freeze(['ok', 'absent', 'expired', 'unreadable']);

// resolveGitDir 은 codex-invoke.js 의 **모든** 호출 경로에서 불린다. git 을 spawn 하면
// 그 비용이 호출마다 붙으므로 순수 fs 상향 탐색이고, 결과는 프로세스 단위로 캐시한다.
const gitDirCache = new Map();

function warn(line) {
  process.stderr.write('[mccp:codex-policy] ' + line + '\n');
}

// worktree 에서 `.git` 은 디렉토리가 아니라 `gitdir: <path>` 한 줄을 담은 **파일**이다.
// 그 분기를 놓치면 worktree 에서 봉인 경로가 통째로 어긋난다(CLAUDE.md 3.8).
function readGitDirFile(gitPath, containingDir) {
  let raw;
  try {
    raw = fs.readFileSync(gitPath, 'utf8');
  } catch (_) {
    return null;
  }
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(raw);
  if (!m) return null;
  const target = m[1];
  return path.isAbsolute(target) ? path.normalize(target) : path.resolve(containingDir, target);
}

function resolveGitDir(startDir) {
  const from = startDir || process.cwd();
  if (gitDirCache.has(from)) return gitDirCache.get(from);

  let dir = path.resolve(from);
  let out = null;
  for (;;) {
    const candidate = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(candidate); } catch (_) { st = null; }
    if (st) {
      out = st.isDirectory() ? candidate : readGitDirFile(candidate, dir);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  gitDirCache.set(from, out);
  return out;
}

function sealPathFor(gitDir) {
  return path.join(gitDir, SEAL_REL_DIR, SEAL_BASENAME);
}

// sealPolicy — 게이트 진입 시 1회. 지우고-쓰기 순서를 지킨다: 나중에 지우면 unlink 가
// 실패했을 때 stale 산출물이 살아남아 다음 소비자가 그것을 읽는다(plan.md 5.2e 규약).
function sealPolicy(opts) {
  const o = opts || {};
  const gitDir = o.gitDir;
  if (!gitDir) throw new Error('sealPolicy: gitDir is required');
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const target = sealPathFor(gitDir);
  const body = {
    codex_disabled: envValue.parseBool(o.env || {}, ENV_CODEX_DISABLED),
    sealed_at: new Date(now).toISOString(),
  };

  fs.mkdirSync(path.dirname(target), { recursive: true });
  try { fs.unlinkSync(target); } catch (_) { /* 부재는 정상 */ }
  fs.writeFileSync(target, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });

  // write 가 0 을 반환하고도 빈 파일이 남는 실패 모드(가득 찬 디스크가 open 에서 성공을
  // 보고하는 경우 등)는 exit code 만으로 잡히지 않는다. 이 아티팩트는 정책의 유일한
  // 디스크 사본이므로 되돌려 읽는 한 번의 비용을 치른다.
  const back = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (back.codex_disabled !== body.codex_disabled || back.sealed_at !== body.sealed_at) {
    throw new Error('sealPolicy: read-back mismatch at ' + target);
  }
  return body;
}

// readPolicy — 판정이 아니라 **관측**이다. 부재·만료·판독불가를 구분해 보고한다.
// 판정(resolveCodexDisabled)은 그중 셋을 서로 다르게 다루므로 이 구분이 필요하고,
// 운영자가 "정책이 조용히 강등됐다"를 사후에 읽을 수 있게 하려면 더욱 그렇다.
function readPolicy(opts) {
  const o = opts || {};
  const gitDir = o.gitDir;
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  if (!gitDir) return { found: false, codexDisabled: null, reason: 'absent', ageMs: null };

  const target = sealPathFor(gitDir);
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    // 부재(ENOENT)와 그 밖의 I/O 실패(권한 등)는 다르다. 전자는 정상 상태이고 후자는
    // 봉인이 있었을 수도 있는데 읽지 못한 이상 상태다.
    const reason = (err && err.code === 'ENOENT') ? 'absent' : 'unreadable';
    return { found: false, codexDisabled: null, reason: reason, ageMs: null };
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return { found: false, codexDisabled: null, reason: 'unreadable', ageMs: null };
  }
  if (!body || typeof body !== 'object' || typeof body.codex_disabled !== 'boolean') {
    return { found: false, codexDisabled: null, reason: 'unreadable', ageMs: null };
  }

  const sealedAt = Date.parse(body.sealed_at);
  if (!Number.isFinite(sealedAt)) {
    return { found: false, codexDisabled: null, reason: 'unreadable', ageMs: null };
  }

  const ageMs = now - sealedAt;
  // 미래 타임스탬프(시계 되감김)는 만료가 아니라 판독불가다 — 나이를 신뢰할 수 없다.
  if (ageMs < 0) {
    return { found: false, codexDisabled: null, reason: 'unreadable', ageMs: ageMs };
  }
  if (ageMs > MAX_SEAL_AGE_MS) {
    return { found: false, codexDisabled: body.codex_disabled, reason: 'expired', ageMs: ageMs };
  }
  return { found: true, codexDisabled: body.codex_disabled, reason: 'ok', ageMs: ageMs };
}

// resolveCodexDisabled — 이 모듈의 판정. 헤더의 세 줄 규칙이 그대로 코드가 된다.
function resolveCodexDisabled(opts) {
  const o = opts || {};
  const env = o.env || {};
  const envDisabled = envValue.parseBool(env, ENV_CODEX_DISABLED);
  if (envDisabled) return true;               // env 가 켜져 있으면 봉인을 볼 필요가 없다

  const r = readPolicy({ gitDir: o.gitDir, now: o.now });
  if (r.reason === 'ok') return r.codexDisabled === true;
  if (r.reason === 'unreadable') return true; // 이상 상태 → 비용이 줄어드는 방향
  return false;                               // absent / expired → env 단독(위에서 이미 false)
}

function clearPolicy(opts) {
  const o = opts || {};
  if (!o.gitDir) return false;
  try {
    fs.unlinkSync(sealPathFor(o.gitDir));
    return true;
  } catch (_) {
    return false;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
// `seal` 은 성공과 실패 **모두 exit 0** 이다. 봉인 실패로 게이트를 막으면 새 코드가
// 파이프라인 전체를 세우게 되고, 실패했을 때의 동작은 오늘과 동일(env 단독)하므로
// 나빠지는 것이 없다. 대신 안정된 prefix 로 시끄럽게 실패한다 — 조용한 강등이야말로
// 이 축에서 가장 위험한 실패다.

function main(argv) {
  const sub = argv[0];
  const gitDir = resolveGitDir(process.cwd());

  if (sub === 'seal') {
    if (!gitDir) {
      warn('SEAL FAILED: no .git found from ' + process.cwd() + ' — falling back to env-only policy');
      return 0;
    }
    try {
      const body = sealPolicy({ gitDir: gitDir, env: process.env });
      warn('sealed codex_disabled=' + body.codex_disabled + ' at ' + sealPathFor(gitDir));
    } catch (err) {
      warn('SEAL FAILED: ' + (err && err.message ? err.message : String(err)) +
        ' — falling back to env-only policy (behaviour is unchanged from before this seal existed)');
    }
    return 0;
  }

  if (sub === 'read') {
    process.stdout.write(JSON.stringify(readPolicy({ gitDir: gitDir })) + '\n');
    return 0;
  }

  if (sub === 'clear') {
    const removed = clearPolicy({ gitDir: gitDir });
    warn(removed ? 'seal cleared' : 'no seal to clear');
    return 0;
  }

  process.stderr.write('[mccp:codex-policy] unknown subcommand ' + JSON.stringify(sub || '') +
    '\n  usage: codex-policy.js <seal|read|clear>\n');
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  resolveGitDir: resolveGitDir,
  sealPolicy: sealPolicy,
  readPolicy: readPolicy,
  resolveCodexDisabled: resolveCodexDisabled,
  clearPolicy: clearPolicy,
  sealPathFor: sealPathFor,
  MAX_SEAL_AGE_MS: MAX_SEAL_AGE_MS,
  READ_REASONS: READ_REASONS,
  ENV_CODEX_DISABLED: ENV_CODEX_DISABLED,
};
