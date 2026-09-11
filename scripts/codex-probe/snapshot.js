'use strict';

// Codex 홈 상태 투영 + 두 스냅샷 대조 (Task 1).
//
// "순수층"은 **판정에 대해서만** 성립한다. 홈을 재는 것이 목적이라 `capture`에는 fs 읽기가
// 있을 수밖에 없다. 대신 `diff(before, after)`는 두 스냅샷 객체만 보고 파일시스템을 다시
// 읽지 않으므로 합성 입력으로 부정 케이스를 결정적으로 단언할 수 있다 —
// mirror는 `scripts/test-suite/enumerate.js`의 2층 분리다.
//
// **DD3-b — 잔여 판정은 whole-file sha256이 아니다.** PRD Metric 5는 측정 전후
// `~/.codex/config.toml` sha256 일치를 요구했는데 그 지표는 mccp와 무관한 이유로 붉어진다:
// Codex가 통상 운용 중 같은 파일에 `[tui.model_availability_nux]`·`[projects…] trust_level`을
// 스스로 쓴다. 그래서 잔여는 **mccp 귀속 키 부재 + 캐시 엔트리 0**으로 판정하고, whole-file
// sha256은 `config_sha256`에 informational로만 싣는다.
//
// **security R1 C1 — 이 모듈의 출력이 git-tracked 산출물로 간다.** `plugin_cache_entries`는
// 실제 홈을 잴 때 `~/.codex/plugins/cache/mccp/...`를 가리키는데, DD3-b가 보고하려는 잔여물이
// 정확히 그 경로라 이 필드는 **설계상 비지 않는다**. 그래서 절대경로를 만들지 않는 것이
// 1차 방어다 — 엔트리는 `codexHome` 기준 **상대경로**로 반환한다. 선택적 `redactor`는
// 그 위의 백스톱이고, 최종 관문은 `redact-gate.js`(DD10)다.
//
// **`config_mccp_keys`도 같은 축이다 — 이 대칭은 실측으로 깨져 있었다** (코드 리뷰 H1).
// 이 필드는 "테이블 헤더 이름"이라 경로를 담지 않는다고 읽히기 쉽지만, Codex가 스스로 쓰는
// trust 헤더가 `[projects."<절대경로>"]` 형태이고 그 경로에 `mccp` 세그먼트가 있으면
// (즉 **이 저장소에서 프로브를 돌리면 반드시**) 아래 귀속 판정이 그것을 잡는다. 그러면
// 계정명을 담은 절대경로가 그대로 실린다. 두 필드는 같은 처리를 받아야 한다 —
// 한쪽만 접는 것은 "이 필드는 경로가 아니다"라는 **가정**이었고 그 가정이 거짓이었다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'mccp.codex-probe.snapshot/1';

// TOML 테이블 헤더. `[a.b]`와 `[[a.b]]` 양쪽을 받는다.
const TABLE_RE = /^\s*\[\[?([^\]]+)\]\]?\s*$/;

// mccp 귀속 판정은 **경계 일치**다(§ Patterns — "부분 문자열 일치는 접두사 충돌로
// 드리프트를 감춘다"). 경계 문자 클래스를 `[^A-Za-z0-9]`로 넓게 잡은 것은 의도다:
// 이 판정의 오탐은 "우리 것이 아닌 잔여를 보고한다"(조사하면 끝)이고, 미탐은
// "mccp 키가 남았는데 clean이라고 말한다"이다. 둘은 대칭이 아니므로 매치 쪽으로 기운다.
// 그래서 `mccp-x`·`mccp_x`·`mccp@x`는 걸리고 `xmccp`·`mccpx`는 걸리지 않는다.
const MCCP_TOKEN_RE = /(^|[^A-Za-z0-9])mccp([^A-Za-z0-9]|$)/;

function isMccpAttributed(header) {
  return MCCP_TOKEN_RE.test(String(header || ''));
}

// TOML을 파싱하지 않고 테이블 헤더만 훑는다. 의존성을 하나도 늘리지 않기 위해서이고,
// 이 축이 필요로 하는 것이 값이 아니라 **키의 존재**이기 때문이다.
function mccpKeysFromToml(text) {
  const out = [];
  String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
    const m = TABLE_RE.exec(line);
    if (!m) return;
    const header = m[1].trim();
    if (isMccpAttributed(header)) out.push(header);
  });
  return Array.from(new Set(out)).sort();
}

function sha256(buf) {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

// `<codexHome>/plugins/cache` 아래의 엔트리를 **codexHome 상대경로**로 열거한다.
// 깊이 2까지만 본다 — 관심사는 "어떤 플러그인이 잔존하는가"이지 그 내부 파일이 아니고,
// 무제한 재귀는 tracked 산출물의 크기를 관측 대상과 무관하게 부풀린다.
function listCacheEntries(codexHome) {
  const root = path.join(codexHome, 'plugins', 'cache');
  const out = [];
  let level1;
  try {
    level1 = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  level1.forEach(function (e1) {
    const rel1 = path.posix.join('plugins', 'cache', e1.name);
    if (!e1.isDirectory()) { out.push(rel1); return; }
    let level2 = [];
    try {
      level2 = fs.readdirSync(path.join(root, e1.name), { withFileTypes: true });
    } catch (_) { /* 읽을 수 없으면 디렉토리 자체만 남긴다 */ }
    // 빈 디렉토리는 **그 자체가 관측값**이다(DD3-b). uninstall 후에도
    // `plugins/cache/mccp/`가 빈 채 잔존하는 것이 "잔여 캐시 0"을 이미 거짓으로 만든 사실이다.
    if (level2.length === 0) { out.push(rel1 + '/'); return; }
    level2.forEach(function (e2) {
      out.push(path.posix.join(rel1, e2.name) + (e2.isDirectory() ? '/' : ''));
    });
  });
  return out.sort();
}

// `codexVersion`을 인자로 받는다 — 이 모듈이 `codex --version`을 spawn하면 순수/실행
// 분리가 깨지고 test가 실제 바이너리에 의존하게 된다. 실행층(`cli.js`)이 재서 넘긴다.
//
// UI13: 버전 없는 측정치는 인용하지 않는다. 여기서는 `null`을 그대로 싣고,
// 접는 판정은 `report.js`가 한다 — 관측기가 값을 지어내지 않는다.
function capture(opts) {
  const o = opts || {};
  const codexHome = o.codexHome;
  if (!codexHome) throw new Error('capture: codexHome required');
  const kind = o.kind || 'unknown';
  const redact = o.redactor && typeof o.redactor.redactText === 'function'
    ? function (s) { return o.redactor.redactText(s); }
    : function (s) { return s; };

  const configPath = path.join(codexHome, 'config.toml');
  let raw = null;
  try {
    raw = fs.readFileSync(configPath);
  } catch (_) { /* 부재는 정상 산출이다 — scratch home은 처음에 비어 있다 */ }

  const text = raw === null ? '' : raw.toString('utf8');
  return {
    schema: SCHEMA,
    at: (o.now || new Date()).toISOString(),
    codex_home_kind: kind,
    codex_version: o.codexVersion == null ? null : String(o.codexVersion),
    config_present: raw !== null,
    // informational only — 판정에 쓰지 않는다(DD3).
    config_sha256: raw === null ? null : sha256(raw),
    config_mccp_keys: mccpKeysFromToml(text).map(redact),
    plugin_cache_entries: listCacheEntries(codexHome).map(redact),
  };
}

// 두 스냅샷의 **mccp 귀속 투영**만 대조한다. `config_sha256`은 비교 대상이 아니다 —
// DD3가 그 지표를 폐기했고, 여기서 비교하면 폐기한 기준이 뒷문으로 돌아온다.
//
// `comparable:false`는 "같다"도 "다르다"도 아니다. 스냅샷이 없거나 스키마가 어긋나면
// clean을 **주장하지 않는다** — 아무것도 재지 않은 실행이 통과하는 것이 이 축의 유일한
// 실패 모드다(리뷰 R1 test-MEDIUM: positive control 부재).
function diff(before, after) {
  const okShape = function (s) { return !!s && s.schema === SCHEMA; };
  if (!okShape(before) || !okShape(after)) {
    return { comparable: false, clean: false, added: [], removed: [], changed: [], reason: 'snapshot missing or schema mismatch' };
  }
  const setOf = function (s, k) { return new Set((s[k] || []).map(String)); };
  const added = [];
  const removed = [];
  ['config_mccp_keys', 'plugin_cache_entries'].forEach(function (k) {
    const b = setOf(before, k);
    const a = setOf(after, k);
    a.forEach(function (v) { if (!b.has(v)) added.push(k + ':' + v); });
    b.forEach(function (v) { if (!a.has(v)) removed.push(k + ':' + v); });
  });
  const changed = [];
  if (before.codex_version !== after.codex_version) {
    changed.push('codex_version');
  }
  return {
    comparable: true,
    clean: added.length === 0 && removed.length === 0 && changed.length === 0,
    added: added.sort(),
    removed: removed.sort(),
    changed: changed,
    reason: null,
  };
}

module.exports = { SCHEMA, capture, diff, mccpKeysFromToml, isMccpAttributed, listCacheEntries };
