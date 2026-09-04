'use strict';

// install-skew — 활성 설치 판본과 이 워크트리 HEAD의 격차를 판정하는 read-only 오라클.
//
// review-record-linkage M5 (DD1·DD2). 이 모듈은 배선을 만들지 않는다. 이미 있는
// 배선이 **왜 발화하지 않는지**를 말하는 입이다: `marketplace.json`이 `ref: release`를
// 가리키므로 사용자 캐시가 main을 추종하지 않고, 그래서 in-flight 명령 본문이 실행되지
// 않는 것이 사고가 아니라 릴리스 채널 분리 이후의 **항구적 기본 상태**다.
//
// ── DD4 — 진단은 fail-open이고 어떤 경로도 차단하지 않는다 (축자 이전) ──────────
//
//   `dep-check.js` 헤더의 "Never throws" 계약이 있고, session-start 배너는 세션을
//   막지 않는 자리다. skew가 게이트를 막으면 **캐시가 뒤처진 모든 사용자의 모든
//   게이트가 죽는다** — F2대로 그것이 기본 상태이므로 차단은 곧 전면 정지다. 모듈
//   로드 실패는 §3.17 M2 선례대로 `{ state: 'unknown', reason: 'oracle_unavailable' }`
//   sentinel로 접는다.
//
// 이 문단이 코드 옆에 있는 이유는 후속 사이클이 "fail-closed가 더 안전하다"로 뒤집는
// 것을 막기 위해서다. 뒤집으려면 위 문장이 왜 틀렸는지를 먼저 반박해야 한다.
//
// ── DD4a — 소비처 배너는 `MCCP_CODEX_DISABLED` 가드 밖에 산다 (축자 이전) ────────
//
//   판본 격차는 Codex 가용성과 무관한 축이다. 두 축을 한 가드에 묶을 근거가 없다.
//   `session-start.js`의 dep-check 블록 전체가 그 가드 안에 있고 표준 설치에는
//   `MCCP_CODEX_DISABLED=1`이 실제로 설정돼 있으므로(§3.12), 그 안에 배너를 두면
//   이 진단은 기본 구성에서 **한 번도 발화하지 않는다** — 통로를 만들고 부르지 않는
//   것, 이 마일스톤이 닫으려는 실패 그 자체다.
//
// ── 이 진단이 탐지하지 못하는 것 (신뢰 모델의 내재 한계) ────────────────────────
//
// `installed_plugins.json`은 저장소 밖에 있고 Claude Code CLI가 소유한다. 그 파일에
// 쓸 수 있는 주체는 `gitCommitSha`를 현재 HEAD로 위조해 `state:'current'`를 강제할
// 수 있다 — 레지스트리의 주장과 디스크의 실체를 묶는 무결성 결속(서명·설치 트리
// 해시)이 없기 때문이다. 즉 이 오라클은 **사고성 노후**를 탐지하며, `~/.claude/`를
// 이미 장악한 로컬 공격자를 탐지하지 않는다. 그 축을 닫으려면 별도의 설치 트리 해시
// 축이 필요하고 그것은 M5 범위 밖이다 (Implement-gate security-reviewer #7).
//
// ── 오염된 입력을 다루는 규칙 ───────────────────────────────────────────────────
//
//   1. 반환 어디에도 **경로 형태 문자열을 싣지 않는다.** 실패 원인은 enum뿐이고
//      `err.message`는 절대 싣지 않는다 (M4 H1 선례: 호스트 절대경로 유출).
//   2. `gitCommitSha`는 git 인자가 되기 전에 `SHA_RE`(hex 전용)를 통과해야 한다.
//      `-`로 시작하는 값은 rev가 아니라 **옵션**으로 해석된다.
//   3. `CLAUDE_PLUGIN_ROOT`는 **어떤 fs/git 접촉보다 먼저** 로컬·절대·비-UNC로
//      검증한다. 검증을 try/catch 안에 두면 예외가 잡힐 때는 이미 네트워크 호출이
//      끝난 뒤다 (security-reviewer #1: repo-tracked `.claude/settings.json`의 `env`
//      블록이 이 변수를 UNC로 세팅할 수 있고, SessionStart는 무상호작용 자동 실행이라
//      악성 저장소를 여는 것만으로 SMB/NTLM 자격증명이 나간다).
//   4. `installed_version`은 sanitize하지 않고 **원문 그대로** 돌려준다. 그것을
//      터미널에 내는 소비처가 `dep-check.safeLabel`을 거친다 — `dep-check.js`가
//      이미 같은 파일의 같은 필드에 대해 세운 분업이다 (security-reviewer #2).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const PLUGIN_KEY = 'mccp@mccp';

// hex 전용. 이 문자 집합에는 `-`도 `=`도 구분자도 없으므로 아래 두 argv 위치
// (`merge-base <sha> HEAD` · `rev-list --count <sha>..HEAD`)에서 옵션으로 해석될
// 방법이 없다. 이 정규식을 완화하려는 사람은 `--end-of-options` 주석을 함께 읽어라.
const SHA_RE = /^[0-9a-f]{7,40}$/;

// 레지스트리 read 상한. `dep-check.js#readInstalledPlugins`에는 상한이 없지만(선재
// 결함, backlog 이연) 새 소비처를 상한 없이 늘리지는 않는다 (security-reviewer #5).
const REGISTRY_MAX_BYTES = 4 * 1024 * 1024;

// 동기 SessionStart를 무한 정지시키지 않는다. #1의 UNC 경로가 미응답 호스트를
// 가리키면 OS SMB 타임아웃이 수십 초이므로, timeout 부재는 자격증명 유출 시도를
// 그대로 hang으로 바꾼다 (security-reviewer #5).
const GIT_TIMEOUT_MS = 5000;

const STATES = Object.freeze({
  current: 'current',
  behind: 'behind',
  diverged: 'diverged',
  unknown: 'unknown',
});

// 실패 원인은 **닫힌 enum**이다. 문자열 자유 서술을 허용하면 그 자리로 경로가 샌다.
const REASONS = Object.freeze({
  gitFailed: 'git_failed',
  notARepo: 'not_a_repo',
  registryUnreadable: 'registry_unreadable',
  shaAbsent: 'sha_absent',
  shaMalformed: 'sha_malformed',
  overrideUnjudged: 'override_unjudged',
  oracleUnavailable: 'oracle_unavailable',
});

const CACHE_SUFFIX = path.join('.claude', 'plugins', 'cache');

function skeleton() {
  return {
    state: STATES.unknown,
    installed_version: null,
    installed_sha: null,
    head_sha: null,
    commits_behind: null,
    plugin_dir_override: false,
    reason: null,
  };
}

function fail(out, reason) {
  out.state = STATES.unknown;
  out.reason = reason;
  return out;
}

// `CLAUDE_PLUGIN_ROOT`가 캐시 안을 가리키는지 판정한다.
//
// substring 비교는 세 갈래로 뚫린다 — `..` 세그먼트가 든 경로가 문자열로는 캐시를
// 포함하면서 다른 곳으로 resolve되고, win32는 대소문자가 다르며, 접미 경계가 없으면
// `...cacheXYZ`가 `...cache`에 매칭된다. 그 셋 중 하나라도 뚫리면 **변조된 설치가
// `plugin_dir_override=false`로 남아 `current`로 보고된다** — 이 모듈의 존재 이유가
// 그 자리에서 무력화된다 (security-reviewer #3).
//
// `path.relative`가 셋을 한 번에 닫는다: 양쪽을 resolve한 뒤의 관계를 돌려주므로
// `..` 세그먼트가 결과에 나타나고, win32에서는 대소문자를 무시하며, 다른 드라이브면
// 절대경로를 돌려준다. 접미 경계는 세그먼트 분해가 보장한다.
function isInsideCache(resolvedDir, homeDir) {
  const home = (typeof homeDir === 'string' && homeDir) ? homeDir : os.homedir();
  const cacheRoot = path.resolve(path.join(home, CACHE_SUFFIX));
  let rel;
  try {
    rel = path.relative(cacheRoot, path.resolve(resolvedDir));
  } catch (_err) {
    return false;
  }
  if (rel === '') return true;
  if (typeof rel !== 'string') return false;
  if (path.isAbsolute(rel)) return false;
  return !rel.split(/[\\/]/).some(function (seg) { return seg === '..'; });
}

// **fs/git 접촉 전에** 돈다. 반환의 `dir`은 접촉해도 되는 것으로 판정된 경로뿐이다.
function classifyPluginRoot(raw, homeDir) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { override: false, safe: true, dir: null };
  }
  const value = raw.trim();

  // UNC(`\\host\share`) 와 POSIX 이중 슬래시(`//host/share`)는 **원문에서** 거부한다.
  // path.resolve를 먼저 걸면 판정 대상이 정규화되면서 형태가 바뀔 수 있고, 그
  // 시점에는 이미 판정 근거가 사라진다.
  if (/^[\\/]{2}/.test(value)) {
    return { override: true, safe: false, dir: null };
  }
  // 상대 경로는 cwd 의존이라 무엇을 판정하는지 말할 수 없다. 추정하지 않는다.
  if (!path.isAbsolute(value)) {
    return { override: true, safe: false, dir: null };
  }

  let resolved;
  try {
    resolved = path.resolve(value);
  } catch (_err) {
    return { override: true, safe: false, dir: null };
  }
  // resolve 후에도 UNC가 남으면(win32에서 `\\?\UNC\...` 등) 거부한다.
  if (/^[\\/]{2}/.test(resolved)) {
    return { override: true, safe: false, dir: null };
  }

  if (isInsideCache(resolved, homeDir)) {
    return { override: false, safe: true, dir: resolved };
  }
  return { override: true, safe: true, dir: resolved };
}

// 기본 effect — 레지스트리 read. 상한 초과·부재·파손은 전부 `null`이고, 어느 것도
// throw하지 않는다. 호출자는 그래도 try/catch로 감싼다 (security-reviewer #4:
// 주입된 구현이 throw하지 않는다는 약속에만 의존하지 않는다).
function defaultReadInstalled(filePath) {
  const target = filePath || INSTALLED_PLUGINS_PATH;
  let stat;
  try {
    stat = fs.statSync(target);
  } catch (_err) {
    return null;
  }
  if (!stat.isFile() || stat.size > REGISTRY_MAX_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (_err) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.plugins || typeof parsed.plugins !== 'object') {
    return null;
  }
  const entries = parsed.plugins[PLUGIN_KEY];
  if (!Array.isArray(entries) || entries.length === 0) return null;
  // `entries[0]`은 `dep-check.js:81`(checkCodexPlugin)이 같은 레지스트리에 대해 이미
  // 택한 규칙이다. 다중 엔트리(설치 실패 잔재)에서 stale한 쪽을 읽을 수 있다는 것을
  // 알고 택한다 — 두 모듈이 같은 파일을 다르게 읽으면 그 불일치 자체가 새 결함이 된다
  // (security-reviewer #8).
  const first = entries[0];
  return (first && typeof first === 'object') ? first : null;
}

// 기본 effect — git. 절대 throw하지 않고 `{ status, stdout }`을 돌려준다.
// spawn 실패·timeout은 `status: null`이다.
function defaultRunGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, {
      cwd: cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      // stdin을 막는다 — credential helper가 프롬프트를 띄우면 동기 훅이 멎는다.
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return { status: 0, stdout: String(stdout || '') };
  } catch (err) {
    const status = (err && typeof err.status === 'number') ? err.status : null;
    return { status: status, stdout: '' };
  }
}

// 주입된 구현이 throw해도 오라클은 죽지 않는다 (security-reviewer #4 — 두 층 방어의
// 안쪽. 바깥쪽은 `dep-check.js#checkInstallSkew`의 lazy-require + try/catch다).
function callGit(runGit, args, cwd) {
  try {
    const r = runGit(args, cwd);
    if (!r || typeof r !== 'object') return { status: null, stdout: '' };
    const status = (typeof r.status === 'number') ? r.status : null;
    return { status: status, stdout: typeof r.stdout === 'string' ? r.stdout : '' };
  } catch (_err) {
    return { status: null, stdout: '' };
  }
}

function headSha(runGit, cwd) {
  const probe = callGit(runGit, ['rev-parse', '--is-inside-work-tree'], cwd);
  if (probe.status !== 0 || probe.stdout.trim() !== 'true') {
    return { ok: false, reason: REASONS.notARepo };
  }
  const head = callGit(runGit, ['rev-parse', 'HEAD'], cwd);
  if (head.status !== 0) return { ok: false, reason: REASONS.gitFailed };
  const sha = head.stdout.trim();
  if (!SHA_RE.test(sha)) return { ok: false, reason: REASONS.gitFailed };
  return { ok: true, sha: sha };
}

// override 디렉토리의 `plugin.json` version. 읽을 수 없으면 `null` — 그것이 override
// 판정 자체를 무효로 만들지는 않는다(sha가 판정의 근거다).
function readPluginVersion(dir) {
  try {
    const p = path.join(dir, '.claude-plugin', 'plugin.json');
    const stat = fs.statSync(p);
    if (!stat.isFile() || stat.size > REGISTRY_MAX_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (parsed && typeof parsed.version === 'string') ? parsed.version : null;
  } catch (_err) {
    return null;
  }
}

// 계약: **절대 throw하지 않는다.** 어떤 게이트도 막지 않는다 (DD4).
//
//   options.env                  기본 process.env
//   options.repoRoot             판정 기준이 되는 저장소 (기본 process.cwd())
//   options.homeDir              캐시 루트 계산용 홈 (기본 os.homedir(), test 전용)
//   options.installedPluginsPath 레지스트리 경로 override (test 전용)
//   options.readInstalled        주입 effect — (filePath) => entry|null
//   options.runGit               주입 effect — (args, cwd) => { status, stdout }
function resolveInstallSkew(options) {
  const out = skeleton();
  try {
    const opts = options || {};
    const env = opts.env || process.env;
    const readInstalled = typeof opts.readInstalled === 'function' ? opts.readInstalled : defaultReadInstalled;
    const runGit = typeof opts.runGit === 'function' ? opts.runGit : defaultRunGit;
    const repoRoot = (typeof opts.repoRoot === 'string' && opts.repoRoot) ? opts.repoRoot : process.cwd();

    // 1 — override 판정이 **가장 먼저**다. 아직 아무것도 만지지 않았다.
    const root = classifyPluginRoot(env.CLAUDE_PLUGIN_ROOT, opts.homeDir);
    out.plugin_dir_override = root.override;

    // 2 — 이 저장소의 HEAD. 비교의 오른쪽 항.
    const head = headSha(runGit, repoRoot);
    if (!head.ok) return fail(out, head.reason);
    out.head_sha = head.sha;

    // 3 — **실제로 실행 중인 빌드**의 sha. override면 그 디렉토리의 HEAD이고, 아니면
    //     레지스트리가 주장하는 설치 커밋이다. override 상태에서 레지스트리를 읽는 것은
    //     실행되지 않는 사본을 판정하는 것이라 무의미하다.
    if (root.override) {
      // shape 검증에 실패한 override는 **접촉 없이** 접는다. 무판정 침묵이 아니라
      // 판정 불가를 말한다 (L2 security MEDIUM 흡수 + security-reviewer #1).
      if (!root.safe) return fail(out, REASONS.overrideUnjudged);
      const overrideHead = headSha(runGit, root.dir);
      if (!overrideHead.ok) return fail(out, REASONS.overrideUnjudged);
      out.installed_sha = overrideHead.sha;
      out.installed_version = readPluginVersion(root.dir);
    } else {
      let entry = null;
      try {
        entry = readInstalled(opts.installedPluginsPath || INSTALLED_PLUGINS_PATH);
      } catch (_err) {
        entry = null;
      }
      if (!entry || typeof entry !== 'object') return fail(out, REASONS.registryUnreadable);
      out.installed_version = typeof entry.version === 'string' ? entry.version : null;
      const sha = entry.gitCommitSha;
      // 명시적 타입 가드를 먼저 둔다. `RegExp.test`의 강제 변환에 기대면
      // `sha_absent`와 `sha_malformed`의 구분이 우연에 의존한다 (security-reviewer #6).
      if (typeof sha !== 'string' || sha.length === 0) return fail(out, REASONS.shaAbsent);
      if (!SHA_RE.test(sha)) return fail(out, REASONS.shaMalformed);
      out.installed_sha = sha;
    }

    // 4 — 도달성. version 문자열 비교가 아니다 (DD2: UI8 이후 자식 브랜치가 번호를
    //     선언하지 않으므로 두 값이 같으면서 내용이 다른 상태가 **정상**이다).
    //
    // `--end-of-options`는 `rev-list`에만 붙인다. `merge-base`에 붙이면 뒤따르는
    // `--is-ancestor`가 rev로 해석돼 `fatal: Not a valid object name --is-ancestor`
    // (exit 128)이 된다 — 실측했다. 권고를 형태 확인 없이 옮기면 방어층이 아니라
    // 상시 `git_failed`가 된다 (security-reviewer #6, 부분 적용).
    const anc = callGit(runGit, ['merge-base', '--is-ancestor', out.installed_sha, out.head_sha], repoRoot);
    if (anc.status === 1) {
      // exit 1 = 조상이 아니다. exit 128(존재하지 않는 객체)은 아래에서 git_failed다 —
      // "조상이 아니다"와 "그 커밋을 모른다"는 다른 관측이고, 후자를 diverged로 접으면
      // 판정 불가를 판정으로 위장하게 된다.
      out.state = STATES.diverged;
      return out;
    }
    if (anc.status !== 0) return fail(out, REASONS.gitFailed);

    const count = callGit(
      runGit,
      ['rev-list', '--count', '--end-of-options', out.installed_sha + '..' + out.head_sha],
      repoRoot
    );
    if (count.status !== 0) return fail(out, REASONS.gitFailed);
    const n = parseInt(count.stdout.trim(), 10);
    if (!Number.isInteger(n) || n < 0) return fail(out, REASONS.gitFailed);

    out.commits_behind = n;
    out.state = n === 0 ? STATES.current : STATES.behind;
    return out;
  } catch (_err) {
    // 여기 도달하는 것은 위의 방어를 전부 지나친 예기치 못한 throw다. DD4대로
    // 조용히 접지 않고 `unknown`으로 **말한다**.
    return fail(out, REASONS.oracleUnavailable);
  }
}

module.exports = {
  resolveInstallSkew: resolveInstallSkew,
  classifyPluginRoot: classifyPluginRoot,
  isInsideCache: isInsideCache,
  defaultReadInstalled: defaultReadInstalled,
  STATES: STATES,
  REASONS: REASONS,
  SHA_RE: SHA_RE,
  INSTALLED_PLUGINS_PATH: INSTALLED_PLUGINS_PATH,
  PLUGIN_KEY: PLUGIN_KEY,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(resolveInstallSkew({}), null, 2) + '\n');
}
