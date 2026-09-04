'use strict';

// 렌더러 두 면(html footer · markdown footer)이 공유하는 **단일 파생원**.
//
// 그전까지 두 면은 번호를 리터럴로 박고 있었다(html.js:1422 · markdown.js:163).
// 그래서 릴리스 컷이 다섯 면을 한 커밋으로 움직여야 했고, 그 다섯 중 둘이 여기서
// 사라진다 — PRD Open Question 2 의 답이 예고한 그대로다.
//
// **절대 throw 하지 않는다.** 버전 문자열이 대시보드를 못 그리게 만드는 것은 그
// 문자열의 권한이 아니다. 실패는 sentinel 로 접히고 `reason` 이 무엇이 실패했는지
// 말한다 — derive/host-version.js:11-19 가 세운 fail-open 형태이며, 그 모듈처럼
// 출처 라벨을 표면화한다.
//
// **host-version.js 와 혼동하지 말 것.** 그 모듈이 이 manifest 를 **의도적으로
// 읽지 않는** 것은 *호스트 프로젝트* 의 버전 신호 축이고("plugin self-version stay
// invisible"), 여기서 파생하는 것은 *이 플러그인 자신* 의 렌더 출처 스탬프다.
// 축이 다르다.
//
// 경로 산술: 이 파일은 `plugins/mccp/scripts/lib/renderer/` 에 있으므로 `..` 3단이
// `plugins/mccp/` 다. 설치 캐시에서도 같다 —
// `~/.claude/plugins/cache/mccp/mccp/<ver>/scripts/lib/renderer/` 와
// `.../<ver>/.claude-plugin/plugin.json` 이 함께 실재함을 2026-09-04 에 확인했다
// (security-reviewer 가 캐시 1.33.7 을 직접 열어 독립 재확인).
//
// semver 검사는 **앵커된 전체 일치**다. 느슨한 부분 매치는 manifest 의 임의 문자열이
// footer 로 그대로 흘러가는 경로를 남기는데, html.js 의 footer 는 이 저장소에서
// escapeHtml 을 거치지 않는 몇 안 되는 문자열 중 하나다.

const MANIFEST_REL = '../../../.claude-plugin/plugin.json';

// scripts/version-declaration-guard.js:45 와 같은 형태. 앵커가 핵심이다.
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const UNKNOWN_LABEL = 'v미상';

function defaultLoad() {
  // require 는 이 모듈 파일 기준으로 해소되므로 cwd 와 무관하다. 모듈 캐시가
  // 걸리는 것은 알려진 한계이며(장수 프로세스에서 manifest 가 바뀌어도 다시
  // 읽지 않는다 — `/mccp:dashboard` 의 live-reload 서버가 유일한 해당 사례),
  // backlog 가 소유한다. CLI 1회 호출 수명에서는 무해하다.
  // eslint-disable-next-line global-require
  return require(MANIFEST_REL);
}

// { version, degraded, reason }
//   version  — 앵커된 semver 문자열, 또는 null
//   degraded — 파생에 실패했는가
//   reason   — 'ok' | 'manifest-unreadable' | 'version-missing' | 'version-not-semver'
function readPluginVersion(opts) {
  opts = opts || {};
  const load = typeof opts.load === 'function' ? opts.load : defaultLoad;
  const warn = typeof opts.warn === 'function'
    ? opts.warn
    : (msg) => { try { process.stderr.write(msg); } catch (_e) { /* stderr gone */ } };

  const degrade = (reason, detail) => {
    warn('[mccp:renderer] plugin version degraded: ' + reason +
      (detail ? ' (' + detail + ')' : '') +
      ' — footer will read ' + UNKNOWN_LABEL + '\n');
    return { version: null, degraded: true, reason: reason };
  };

  let manifest;
  try {
    manifest = load();
  } catch (err) {
    return degrade('manifest-unreadable', (err && err.message) || String(err));
  }

  const raw = manifest && manifest.version;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return degrade('version-missing', 'got ' + JSON.stringify(raw));
  }

  const v = raw.trim();
  if (!SEMVER_RE.test(v)) {
    return degrade('version-not-semver', JSON.stringify(v));
  }

  return { version: v, degraded: false, reason: 'ok' };
}

// 두 footer 가 쓰는 표시 문자열. 강등이면 정직한 '미상' 이지 추측이 아니다.
function footerVersionLabel(opts) {
  const r = readPluginVersion(opts);
  return r.degraded ? UNKNOWN_LABEL : 'v' + r.version;
}

module.exports = {
  readPluginVersion: readPluginVersion,
  footerVersionLabel: footerVersionLabel,
  SEMVER_RE: SEMVER_RE,
  UNKNOWN_LABEL: UNKNOWN_LABEL,
  MANIFEST_REL: MANIFEST_REL,
};
