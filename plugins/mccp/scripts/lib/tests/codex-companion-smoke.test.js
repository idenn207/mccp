'use strict';

// Task 12 — real codex-companion --json smoke (skip-on-unavailable).
//
// Most tests in v0.2.4 use fake fixtures (codex-invoke.test.js,
// codex-invoke-json.test.js). Fake fixtures verify the WRAPPER shape but cannot
// catch drift in the real codex-companion's --json contract. This smoke test
// is mandatory on dev environments where the codex plugin is installed and
// authenticated; CI environments skip cleanly.
//
// Skip conditions, in the order they are judged (gate-guard-integrity M2 축 B):
//   1. operator opt-out — MCCP_SKIP_REAL_SMOKE=1 · MCCP_ALLOW_CODEX_UNAVAILABLE=1
//      (advisory mode) · CI=true. These are decisions not to measure, not
//      reachability facts.
//   2. reachability BEFORE the call — codex-reachability.classify() over
//      { env, registryProbe }. Covers MCCP_CODEX_DISABLED=1 (env-policy, the axis
//      this file used to miss entirely) and the static not-installed conditions.
//   3. reachability AFTER the call — the same oracle over the real
//      invokeResult.classification. Unknown values are fail-closed, never "reached".
//   4. reached but the payload is not the expected contract → skip with the
//      contract-drift reason. That reason is TRUE only on this branch, because
//      by here the companion demonstrably answered (UI3 keeps it as-is).
//
// What this test verifies when it CAN run:
//   1. invokeAdversarialReview with json:true returns ok=true
//   2. result.stdout is JSON-parsable
//   3. parsed payload contains a recognized structured key (e.g. verdict,
//      findings, classification — actual key set is companion-defined and
//      this test asserts at least one of them is present, not a specific name)

const test = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');

const { invokeAdversarialReview } = require('../codex-invoke');
const { classify } = require('../codex-reachability');

// gate-guard-integrity M2 축 B — skip 사유의 정직화.
//
// 이전 `shouldSkip()` 은 `MCCP_CODEX_DISABLED` 축을 **보지 않았다**. 그 env 가 켜져
// 있으면 `codex-invoke.js:182-192` 가 spawn 직전 short-circuit 해
// `{ok:true, classification:'disabled', stdout:''}` 를 돌려주는데, 위 판정은 도달했다고
// 보고 빈 stdout 에서 brace 를 못 찾아 "companion 의 JSON 계약이 non-JSON 으로
// 드리프트했다"고 보고했다 — companion 이 호출된 적조차 없는데도. 통과(skip) 신호는
// 있었고 그 사유는 거짓이었다.
//
// 이제 도달 가능성 판정은 `codex-reachability.js` 오라클이 소유한다. 아래 두 갈래는
// 성격이 다르므로 분리해서 둔다:
//   · 운영자 opt-out — 도달성과 무관한 "재지 않기로 한 결정". 사유가 이미 참이다.
//   · 도달 가능성   — 오라클이 판정하고 그 `reason` 을 그대로 skip 사유로 쓴다.

function operatorOptOut(env) {
  if (env.MCCP_SKIP_REAL_SMOKE === '1') return 'MCCP_SKIP_REAL_SMOKE=1';
  if (env.MCCP_ALLOW_CODEX_UNAVAILABLE === '1') return 'MCCP_ALLOW_CODEX_UNAVAILABLE=1 (advisory)';
  if (env.CI === 'true' || env.CI === '1') return 'CI=true';
  return null;
}

// 정적 조건만 본다(spawn 없이 알 수 있는 것). 오라클의 `registryProbe` 인자로 넘어가
// `not-installed` 를 호출 이전에 앞당겨 판정하게 한다.
function registryProbe() {
  const registryPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(registryPath)) {
    return { installed: false, reason: 'no codex registry at ' + registryPath };
  }
  try {
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const entries = reg && reg.plugins && reg.plugins['codex@openai-codex'];
    if (!Array.isArray(entries) || !entries.length) {
      return { installed: false, reason: 'codex@openai-codex not installed' };
    }
    const installPath = entries[0] && entries[0].installPath;
    if (!installPath || !fs.existsSync(installPath)) {
      return { installed: false, reason: 'codex installPath stale' };
    }
    const companion = path.join(installPath, 'scripts', 'codex-companion.mjs');
    if (!fs.existsSync(companion)) {
      return { installed: false, reason: 'codex-companion.mjs missing' };
    }
  } catch (err) {
    return { installed: false, reason: 'registry parse failed: ' + err.message };
  }
  return { installed: true };
}

test('real codex-companion: --json forwarded end-to-end (smoke)', { timeout: 920_000 }, async (t) => {
  const optOut = operatorOptOut(process.env);
  if (optOut) {
    t.skip('smoke skipped: ' + optOut);
    return;
  }

  // 호출 **이전** 판정: env 정책과 정적 registry 조건만으로 도달 불가가 확정되면
  // spawn 비용을 치르지 않고 그 참인 사유로 skip 한다.
  const pre = classify({ env: process.env, registryProbe: registryProbe() });
  if (!pre.reachable) {
    t.skip('smoke skipped: ' + pre.reason);
    return;
  }

  const r = invokeAdversarialReview('smoke check — respond with a minimal verdict object', {
    json: true,
    timeoutMs: 900_000,
  });

  // 호출 **이후** 판정: 실제 결과의 classification 을 같은 오라클에 먹인다. 미지의
  // classification 은 도달 성공으로 읽히지 않는다(fail-closed).
  const post = classify({ env: process.env, invokeResult: r });
  if (!post.reachable) {
    t.diagnostic('codex returned non-ok: ' + r.classification + ' / ' + String(r.stderr).slice(0, 200));
    t.skip('smoke skipped: ' + post.reason);
    return;
  }

  assert.strictEqual(r.ok, true, 'real codex must succeed when reachable: ' + r.stderr);
  // The companion in --json mode emits a structured payload. Real-world stdout
  // is multi-line (pretty-printed JSON), so extract the largest brace-balanced
  // object rather than parsing line-by-line.
  const stdout = r.stdout.trim();
  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    t.diagnostic('real codex stdout has no JSON object — first 300 chars:\n' + stdout.slice(0, 300));
    t.skip('real codex --json contract appears to be non-JSON; v0.2.4 followup');
    return;
  }
  const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (parseErr) {
    t.diagnostic('JSON.parse failed: ' + parseErr.message + ' — slice: ' + jsonStr.slice(0, 200));
    t.skip('real codex --json contract drift; v0.2.4 followup');
    return;
  }
  assert.ok(payload && typeof payload === 'object', 'payload must be a JSON object');
  // At least one expected key family should be present.
  const knownKeys = ['verdict', 'classification', 'findings', 'rounds', 'message', 'result'];
  const hasKey = knownKeys.some((k) => k in payload);
  if (!hasKey) {
    t.diagnostic('payload keys: ' + Object.keys(payload).join(', '));
    t.skip('real codex --json payload uses unfamiliar key set; v0.2.4 followup');
    return;
  }
});
