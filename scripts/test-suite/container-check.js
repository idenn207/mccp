#!/usr/bin/env node
'use strict';

// 증거 컨테이너의 전 원소가 3축을 만족하는지 확인한다 (Task 9).
//
// mirror는 `run.js:273-330`의 `validateElement` — **원소 수용은 fail-closed**다.
//
// ── 빈 컨테이너는 비영점이다 ────────────────────────────────────────────────
// 아무것도 검사하지 않은 것이 통과로 읽히면 이 스크립트가 재는 것이 없다. 이
// milestone이 만드는 다른 스크립트는 전부 짝 test를 갖는데 이것만 없었고, 원소를
// 하나도 검사하지 않는 구현(빈 루프 · 키 오타)도 exit 0을 내므로 "전 원소가 3축
// 만족"이라는 판정이 반증 불가였다(L2 R4).

const fs = require('fs');

const MAX_INPUT_BYTES = 16 * 1024 * 1024;

/**
 * 순수 판정층. 컨테이너 객체를 받아 원소별 3축을 잰다.
 *
 * @param {unknown} container
 * @returns {{ok: boolean, checked: number, failures: Array<{label: string, axis: string, value: unknown}>,
 *            reasons: string[], labels: string[]}}
 */
function checkContainer(container) {
  const reasons = [];
  const failures = [];

  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return { ok: false, checked: 0, failures: [], reasons: ['container_invalid'], labels: [] };
  }
  const runs = container.runs;
  if (!Array.isArray(runs)) {
    return { ok: false, checked: 0, failures: [], reasons: ['runs_missing'], labels: [] };
  }
  if (runs.length === 0) {
    // "검사할 것이 없었다"는 통과가 아니다.
    return { ok: false, checked: 0, failures: [], reasons: ['container_empty'], labels: [] };
  }

  const labels = [];
  runs.forEach(function (entry, i) {
    const label = entry && entry.label != null ? String(entry.label) : '#' + i;
    labels.push(label);
    const el = entry && typeof entry === 'object' ? entry : {};
    // 원소는 `{label, ...measurement}` 평면이거나 `{label, element}` 중첩일 수 있다.
    // 둘 다 받되 **추측하지 않는다** — 두 자리 모두에 축이 없으면 부재로 판정한다.
    const m = el.element && typeof el.element === 'object' ? el.element : el;

    if (m.ok !== true) failures.push({ label: label, axis: 'ok', value: m.ok });
    if (m.attribution !== 'complete') {
      failures.push({ label: label, axis: 'attribution', value: m.attribution });
    }
    if (m.redaction_ok !== true) {
      failures.push({ label: label, axis: 'redaction_ok', value: m.redaction_ok });
    }
  });

  if (failures.length) reasons.push('element_axis_failed');

  return {
    ok: reasons.length === 0,
    checked: runs.length,
    failures: failures,
    reasons: reasons,
    labels: labels,
  };
}

module.exports = { checkContainer };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const wantJson = argv.indexOf('--json') >= 0;
  const file = argv.filter(function (a) { return !a.startsWith('--'); })[0];
  try {
    if (!file) throw new Error('usage: container-check.js <container.json> [--json]');
    const stat = fs.statSync(file);
    if (stat.size > MAX_INPUT_BYTES) {
      throw new Error('container exceeds ' + MAX_INPUT_BYTES + ' bytes (got ' + stat.size + ')');
    }
    const result = checkContainer(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (wantJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      process.stdout.write('checked ' + result.checked + ' element(s): ' +
        (result.labels.join(', ') || '(none)') + '\n');
      result.failures.forEach(function (f) {
        process.stdout.write('  FAIL ' + f.label + '.' + f.axis + ' = ' + JSON.stringify(f.value) + '\n');
      });
      if (result.reasons.length) process.stdout.write('reasons: ' + result.reasons.join(', ') + '\n');
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write('[container-check] ' + String((err && err.message) || err) + '\n');
    process.exitCode = 1;
  }
}
